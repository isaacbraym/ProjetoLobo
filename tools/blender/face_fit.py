"""
Rosto v2 — técnica "Face Photo" estilo WWE 2K (ASSET_PIPELINE §3), chamada por build_character.py.

  F2  landmarks da foto: MediaPipe (tools/face/analyze.ts, Chromium headless) → 478 pontos
  F3  correspondência: render frontal da cabeça-base com a MESMA câmera em perspectiva → MediaPipe no render →
      raio da câmera por cada ponto → ponto na superfície (triângulo + baricêntricas)
  F4  ajuste macro: modificadores faciais do MPFB2 são lineares → mínimos quadrados com limites [0, 1]
      (incr/decr como variáveis separadas, pares esquerda/direita juntos) + alinhamento por similaridade
  F5  resíduo: TPS 2D no plano da câmera, só na frente do rosto, vira um shape key extra
  F6  projeção: UV 'FaceProj' = pixel da foto de cada vértice pela câmera estimada (feito no build depois da pose T)

Tudo em coordenadas do Blender: frente do personagem = -Y, cima = +Z, metros.
"""
import json
import math
import subprocess
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from common import ROOT

TMP = ROOT / '.agent-tmp' / 'face'

# ---- grupos de landmarks do MediaPipe (topologia canônica de 478 pontos) ----
OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
LEFT_EYE = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466]
RIGHT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
LEFT_BROW = [276, 283, 282, 295, 285, 300, 293, 334, 296, 336]
RIGHT_BROW = [46, 53, 52, 65, 55, 70, 63, 105, 66, 107]
LIPS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 185, 40, 39, 37, 0, 267, 269, 270, 409, 78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 191, 80, 81, 82, 13, 312, 311, 310, 415]
NOSE = [1, 2, 4, 5, 6, 19, 94, 97, 98, 326, 327, 168, 197, 195, 64, 294, 48, 278, 115, 344, 220, 440, 45, 275]
IRIS = list(range(468, 478))
EYE_OUTER = (33, 263)  # cantos externos (distância interocular de referência)


def run_mediapipe(images, out_json, seg=False):
    cmd = ['npx', 'tsx', 'tools/face/analyze.ts', *[str(i) for i in images], '--out', str(out_json)] + (['--seg'] if seg else [])
    r = subprocess.run(' '.join(f'"{c}"' if ' ' in c else c for c in cmd), cwd=str(ROOT), shell=True, capture_output=True, text=True, encoding='utf-8')
    print(r.stdout.strip())
    if r.returncode != 0:
        raise RuntimeError(f'MediaPipe falhou: {r.stderr[-2000:]}')
    data = json.loads(Path(out_json).read_text(encoding='utf-8'))
    return data if isinstance(data, list) else [data]


class Cam:
    """Câmera pinhole olhando +Y (de frente para o personagem), imagem quadrada `res`, `f` em pixels."""

    def __init__(self, target: Vector, dist: float, field_m: float, res: int):
        self.target = target.copy()
        self.dist = dist
        self.pos = Vector((target.x, target.y - dist, target.z))
        self.res = res
        self.f = res * dist / field_m

    def project(self, p):
        d = p[1] - self.pos.y
        return (self.res / 2 + self.f * (p[0] - self.pos.x) / d, self.res / 2 - self.f * (p[2] - self.pos.z) / d, d)

    def project_np(self, P):
        d = P[:, 1] - self.pos.y
        return np.stack([self.res / 2 + self.f * (P[:, 0] - self.pos.x) / d, self.res / 2 - self.f * (P[:, 2] - self.pos.z) / d], 1), d

    def ray(self, u, v):
        return self.pos.copy(), Vector(((u - self.res / 2) / self.f, 1.0, -(v - self.res / 2) / self.f)).normalized()

    def blender_camera(self, name='FaceCam'):
        data = bpy.data.cameras.get(name) or bpy.data.cameras.new(name)
        data.type = 'PERSP'
        data.sensor_fit = 'HORIZONTAL'
        data.sensor_width = 36.0
        data.lens = self.f * 36.0 / self.res
        data.clip_start = 0.01
        cam = bpy.data.objects.get(name) or bpy.data.objects.new(name, data)
        if cam.name not in bpy.context.scene.collection.objects:
            bpy.context.scene.collection.objects.link(cam)
        cam.location = self.pos
        cam.rotation_euler = (math.radians(90), 0, 0)
        return cam


def shape_mix(body):
    """Coordenadas da malha com todos os shape keys misturados (índices originais, sem modificadores)."""
    kb = body.data.shape_keys.key_blocks if body.data.shape_keys else None
    n = len(body.data.vertices)
    if not kb:
        out = np.empty(n * 3)
        body.data.vertices.foreach_get('co', out)
        return out.reshape(n, 3)
    basis = np.empty(n * 3)
    kb[0].data.foreach_get('co', basis)
    basis = basis.reshape(n, 3)
    out = basis.copy()
    tmp = np.empty(n * 3)
    for k in kb[1:]:
        if k.mute or k.value == 0.0:
            continue
        k.data.foreach_get('co', tmp)
        out += k.value * (tmp.reshape(n, 3) - basis)
    return out


def group_set(body, prefix):
    idx = {g.index for g in body.vertex_groups if g.name.startswith(prefix)}
    return np.array([any(g.group in idx and g.weight > 0.5 for g in v.groups) for v in body.data.vertices])


def face_render_mesh(body, P):
    """Malha temporária só da cabeça (sem helpers, exceto olhos) com cor por vértice: pele, esclera, íris."""
    helper = group_set(body, 'helper-') | group_set(body, 'joint-')
    eye_l = group_set(body, 'helper-l-eye')
    eye_r = group_set(body, 'helper-r-eye')
    keep_v = (~helper) | eye_l | eye_r
    head_z = P[:, 2].max()
    keep_v &= P[:, 2] > head_z - 0.32
    bm = bmesh.new()
    vmap = {}
    for i in np.nonzero(keep_v)[0]:
        vmap[int(i)] = bm.verts.new(Vector(P[i]))
    for poly in body.data.polygons:
        vs = poly.vertices
        if all(v in vmap for v in vs):
            try:
                bm.faces.new([vmap[v] for v in vs])
            except ValueError:
                pass
    bm.verts.index_update()
    orig = np.zeros(len(bm.verts), dtype=np.int64)
    for i, v in vmap.items():
        orig[v.index] = i
    me = bpy.data.meshes.new('FaceRender')
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new('FaceRender', me)
    bpy.context.scene.collection.objects.link(obj)
    col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for side in (eye_l, eye_r):
        ids = np.nonzero(side[orig])[0]
        if not len(ids):
            continue
        E = P[orig[ids]]
        front = E[np.argmin(E[:, 1])]
        for j in ids:
            p = P[orig[j]]
            r = math.hypot(p[0] - front[0], p[2] - front[2])
            c = (0.02, 0.015, 0.01) if r < 0.0028 else (0.12, 0.07, 0.04) if r < 0.0058 else (0.85, 0.83, 0.8)
            col.data[j].color = (*c, 1.0)
    eyes = eye_l | eye_r
    for j in range(len(orig)):
        if not eyes[orig[j]]:
            col.data[j].color = (0.62, 0.42, 0.32, 1.0)
    me.color_attributes.active_color = col
    for p in me.polygons:
        p.use_smooth = True
    return obj, orig


def render_png(obj, cam: Cam, path: Path, res: int):
    scn = bpy.context.scene
    for o in scn.objects:
        o.hide_render = o is not obj and o.type == 'MESH'
    obj.hide_render = False
    scn.render.engine = 'BLENDER_WORKBENCH'
    scn.display.shading.light = 'STUDIO'
    scn.display.shading.color_type = 'VERTEX'
    scn.display.shading.show_cavity = True
    scn.display.shading.show_specular_highlight = False
    scn.display.shading.background_type = 'VIEWPORT'
    scn.display.shading.background_color = (0.9, 0.9, 0.9)
    scn.render.film_transparent = False
    scn.render.resolution_x = scn.render.resolution_y = res
    scn.render.resolution_percentage = 100
    scn.camera = cam.blender_camera()
    scn.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    for o in scn.objects:
        o.hide_render = False


def surface_points(obj, orig, cam: Cam, lms, ids):
    """Raio da câmera por landmark → ponto na malha. Devolve {id: (vértices originais [3], baricêntricas [3])}."""
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    tree = BVHTree.FromBMesh(bm)
    out = {}
    for i in ids:
        u, v = lms[i][0], lms[i][1]
        o, d = cam.ray(u, v)
        hit, _n, fi, _dist = tree.ray_cast(o, d)
        if hit is None:
            continue
        f = bm.faces[fi]
        a, b, c = (x.co for x in f.verts)
        # baricêntricas
        v0, v1, v2 = b - a, c - a, hit - a
        d00, d01, d11 = v0.dot(v0), v0.dot(v1), v1.dot(v1)
        d20, d21 = v2.dot(v0), v2.dot(v1)
        den = d00 * d11 - d01 * d01
        if abs(den) < 1e-14:
            continue
        w1 = (d11 * d20 - d01 * d21) / den
        w2 = (d00 * d21 - d01 * d20) / den
        out[i] = ([int(orig[x.index]) for x in f.verts], [1 - w1 - w2, w1, w2])
    bm.free()
    return out


def similarity(src, dst, w):
    """Similaridade 2D (escala, rotação, translação) que leva src → dst, ponderada."""
    W = w / w.sum()
    ms, md = (src * W[:, None]).sum(0), (dst * W[:, None]).sum(0)
    S, D = src - ms, dst - md
    a = (W * (S[:, 0] * D[:, 0] + S[:, 1] * D[:, 1])).sum()
    b = (W * (S[:, 0] * D[:, 1] - S[:, 1] * D[:, 0])).sum()
    n = (W * (S ** 2).sum(1)).sum()
    s, th = math.hypot(a, b) / n, math.atan2(b, a)
    R = np.array([[math.cos(th), -math.sin(th)], [math.sin(th), math.cos(th)]]) * s
    t = md - ms @ R.T
    return R, t


def bounded_lsq(A, b, lo, hi, lam, iters=400):
    """min ||Ax-b||² + lam·||x||² com lo ≤ x ≤ hi (descida por coordenadas; problema pequeno)."""
    n = A.shape[1]
    x = np.zeros(n)
    AtA = A.T @ A + lam * np.eye(n)
    Atb = A.T @ b
    for _ in range(iters):
        for j in range(n):
            r = Atb[j] - AtA[j] @ x + AtA[j, j] * x[j]
            x[j] = min(hi[j], max(lo[j], r / AtA[j, j]))
    return x


# ---- variáveis do ajuste: cada uma ≥ 0 (incr e decr separados; esquerda/direita juntas) ----
_PM = ['head-scale-horiz', 'head-scale-vert', 'head-fat', 'forehead-scale-vert', 'forehead-temple', 'nose-scale-horiz',
       'nose-scale-vert', 'nose-flaring', 'nose-point-width', 'nose-nostrils-width', 'nose-width1', 'nose-width2',
       'nose-width3', 'mouth-scale-horiz', 'mouth-scale-vert', 'mouth-lowerlip-height', 'mouth-upperlip-height',
       'mouth-lowerlip-width', 'mouth-upperlip-width', 'chin-width', 'chin-height', 'chin-bones', 'chin-jaw-drop']
_PAIRS = ['nose-trans-up', 'nose-trans-down', 'mouth-trans-up', 'mouth-trans-down', 'eyebrows-trans-up',
          'eyebrows-trans-down', 'mouth-angles-up', 'mouth-angles-down', 'eyebrows-angle-up', 'eyebrows-angle-down',
          'head-oval', 'head-round', 'head-rectangular', 'head-square', 'head-triangular', 'head-invertedtriangular',
          'head-diamond']
_LR = ['eye-trans-up', 'eye-trans-down', 'eye-trans-in', 'eye-trans-out', 'eye-scale-incr', 'eye-scale-decr',
       'eye-height2-incr', 'eye-height2-decr', 'eye-corner1-up', 'eye-corner1-down', 'eye-corner2-up',
       'eye-corner2-down', 'cheek-bones-incr', 'cheek-bones-decr', 'cheek-volume-incr', 'cheek-volume-decr',
       'cheek-inner-incr', 'cheek-inner-decr']


def candidates():
    c = [(f'{b}-{s}', [f'{b}-{s}']) for b in _PM for s in ('incr', 'decr')]
    c += [(n, [n]) for n in _PAIRS]
    c += [(n, [f'l-{n}', f'r-{n}']) for n in _LR]
    return c


def landmark_weights(photo, n=478):
    w = np.full(n, 0.25)
    for ids, k in ((OVAL, 0.7), (LEFT_BROW + RIGHT_BROW, 0.6), (LEFT_EYE + RIGHT_EYE, 1.0), (LIPS, 1.0), (NOSE, 1.0)):
        w[ids] = k
    w[IRIS] = 0.0
    # topo do contorno (testa/linha do cabelo estimada) é pouco confiável
    top = photo[[33, 263], 1].mean() - 0.9 * (photo[152, 1] - photo[[33, 263], 1].mean()) * 0.5
    for i in OVAL:
        if photo[i, 1] < top:
            w[i] = 0.25
    return w


def tps_fit(ctrl, disp, lam):
    """Thin-plate spline 2D (coordenadas normalizadas): devolve função f(pts) → deslocamentos."""
    n = len(ctrl)

    def U(r2):
        with np.errstate(divide='ignore', invalid='ignore'):
            out = 0.5 * r2 * np.log(r2)
        return np.nan_to_num(out)

    K = U(((ctrl[:, None, :] - ctrl[None, :, :]) ** 2).sum(-1)) + lam * np.eye(n)
    Pm = np.hstack([np.ones((n, 1)), ctrl])
    L = np.zeros((n + 3, n + 3))
    L[:n, :n], L[:n, n:], L[n:, :n] = K, Pm, Pm.T
    rhs = np.zeros((n + 3, 2))
    rhs[:n] = disp
    sol = np.linalg.solve(L, rhs)
    a, b = sol[:n], sol[n:]

    def f(pts):
        k = U(((pts[:, None, :] - ctrl[None, :, :]) ** 2).sum(-1))
        return k @ a + np.hstack([np.ones((len(pts), 1)), pts]) @ b

    return f


def fit_face(body, F, photo_res, report):
    """F2–F5. Carrega os modificadores escolhidos (shape keys) e adiciona o resíduo; devolve câmera + alinhamento."""
    from bl_ext.user_default.mpfb.services.targetservice import TargetService
    TMP.mkdir(parents=True, exist_ok=True)
    res = int(photo_res['w'])
    photo = np.array(photo_res['landmarks'])[:, :2]
    P0 = shape_mix(body)
    el, er = group_set(body, 'helper-l-eye'), group_set(body, 'helper-r-eye')
    eye_c = (P0[el].mean(0) + P0[er].mean(0)) / 2
    target = Vector((0.0, float(eye_c[1]), float(eye_c[2]) - 0.03))
    D_ref = 0.6
    # campo de visão: distância entre cantos externos dos olhos ocupa a mesma fração que na foto
    io_photo = np.linalg.norm(photo[EYE_OUTER[0]] - photo[EYE_OUTER[1]])
    field = (np.linalg.norm(P0[el].mean(0) - P0[er].mean(0)) * 1.5) * res / io_photo
    # ---- F3: correspondência pela própria detecção no render da cabeça-base ----
    obj, orig = face_render_mesh(body, P0)
    cam_ref = Cam(target, D_ref, field, res)
    base_png = TMP / 'base_render.png'
    render_png(obj, cam_ref, base_png, res)
    base = run_mediapipe([base_png], TMP / 'base_render.json')[0]
    if not base['found']:
        raise RuntimeError('MediaPipe não achou o rosto no render da cabeça-base')
    rl = np.array(base['landmarks'])
    w_lm = landmark_weights(photo)
    ids = [i for i in range(len(photo)) if w_lm[i] > 0]
    corr = surface_points(obj, orig, cam_ref, rl, ids)
    bpy.data.objects.remove(obj, do_unlink=True)
    ids = [i for i in ids if i in corr]
    V = np.array([corr[i][0] for i in ids])
    Bw = np.array([corr[i][1] for i in ids])
    wl = w_lm[ids]
    ph = photo[ids]

    def model_pts(P):
        return (P[V] * Bw[:, :, None]).sum(1)

    # ---- deltas dos modificadores candidatos (shape keys com valor 0 até a solução) ----
    cands = candidates()
    basis = np.empty(len(body.data.vertices) * 3)
    body.data.shape_keys.key_blocks[0].data.foreach_get('co', basis)
    basis = basis.reshape(-1, 3)
    deltas, keys, labels = [], [], []
    tmp = np.empty_like(basis.ravel())
    for label, names in cands:
        acc = np.zeros((len(ids), 3))
        kbs = []
        ok = True
        for nm in names:
            path = TargetService.target_full_path(nm)
            if not path:
                ok = False
                break
            kb = TargetService.load_target(body, path, weight=0.0, name='fit_' + nm)
            kb.data.foreach_get('co', tmp)
            acc += model_pts(tmp.reshape(-1, 3) - basis)
            kbs.append(kb)
        if not ok:
            print(f'[face] alvo ausente: {label}')
            for kb in kbs:
                body.shape_key_remove(kb)
            continue
        deltas.append(acc)
        keys.append(kbs)
        labels.append(label)
    Dm = np.stack(deltas, 1)  # (L, K, 3)
    beard_mask = np.array([i in OVAL and photo[i, 1] > photo[[61, 291], 1].mean() for i in ids])

    def beard_in(tgt, px_m):
        # barba: o contorno da foto é o da barba; a mandíbula fica `beardDepth` para dentro (em direção ao nariz)
        ctr = tgt[[ids.index(1)]] if 1 in ids else tgt.mean(0, keepdims=True)
        vec = tgt - ctr
        nv = np.linalg.norm(vec, axis=1, keepdims=True) + 1e-9
        return np.where(beard_mask[:, None], tgt - vec / nv * F.get('beardDepth', 0.008) * px_m, tgt)

    def solve(D):
        cam = Cam(target, D, field, res)
        M0 = model_pts(P0)
        q0, d0 = cam.project_np(M0)
        # jacobiano da projeção em cada ponto
        J = np.zeros((len(ids), 2, 3))
        J[:, 0, 0] = cam.f / d0
        J[:, 0, 1] = -cam.f * (M0[:, 0] - cam.pos.x) / d0 ** 2
        J[:, 1, 1] = cam.f * (M0[:, 2] - cam.pos.z) / d0 ** 2
        J[:, 1, 2] = -cam.f / d0
        Aq = np.einsum('lij,lkj->lik', J, Dm)  # (L, 2, K) px por unidade de peso
        core = np.array([w >= 1.0 for w in wl], dtype=float) + 0.05
        Rm, t = similarity(ph, q0, core)
        w = np.zeros(len(labels))
        sw = np.sqrt(wl)
        for _ in range(5):
            tgt = beard_in(ph @ Rm.T + t, cam.f / D)
            A = (Aq * sw[:, None, None]).reshape(-1, len(labels))
            b = ((tgt - q0) * sw[:, None]).reshape(-1)
            w = bounded_lsq(A, b, np.zeros(len(labels)), np.full(len(labels), F.get('maxWeight', 1.0)), F.get('ridge', 3000.0))
            q = q0 + np.einsum('lik,k->li', Aq, w)
            Rm, t = similarity(ph, q, core)
        tgt = beard_in(ph @ Rm.T + t, cam.f / D)
        r0 = np.sqrt((((q0 - (ph @ Rm.T + t)) ** 2).sum(1) * wl).sum() / wl.sum())
        r1 = np.sqrt((((q - tgt) ** 2).sum(1) * wl).sum() / wl.sum())
        io = np.linalg.norm(tgt[ids.index(33)] - tgt[ids.index(263)])
        return cam, Rm, t, w, q, tgt, 100 * r0 / io, 100 * r1 / io

    best = None
    for D in F.get('camDistances', [0.3, 0.4, 0.5, 0.7]):
        sol = solve(D)
        print(f'[face] D={D}: rms antes {sol[6]:.2f}% depois {sol[7]:.2f}% (da distância interocular)')
        if best is None or sol[7] < best[7]:
            best = sol
    cam, Rm, t, w, q, tgt, r0, r1 = best
    for kbs, val in zip(keys, w):
        for kb in kbs:
            kb.value = float(val)
    report['faceFit'] = {
        'camDist': cam.dist, 'rmsBeforePct': round(float(r0), 2), 'rmsAfterPct': round(float(r1), 2),
        'weights': {l: round(float(v), 3) for l, v in zip(labels, w) if v > 0.01}, 'landmarks': len(ids)}
    # ---- F5: resíduo por TPS no plano da câmera (só a frente do rosto) ----
    P1 = shape_mix(body)
    q1, _ = cam.project_np(model_pts(P1))
    sel = wl >= 0.6
    tps = tps_fit(q1[sel] / res, (tgt[sel] - q1[sel]) / res, F.get('tpsSmooth', 3e-4))
    uv, dep = cam.project_np(P1)
    disp = tps(uv / res) * res  # px
    head = P1[:, 2] > eye_c[2] - 0.2
    yn, yb = P1[head, 1].min(), P1[head, 1].max()
    tdep = (P1[:, 1] - yn) / (yb - yn)
    front = np.clip((0.55 - tdep) / 0.2, 0, 1)
    chin_z = model_pts(P1)[ids.index(152), 2] if 152 in ids else eye_c[2] - 0.13
    vert = np.clip((P1[:, 2] - (chin_z - 0.05)) / 0.03, 0, 1) * np.clip(((eye_c[2] + 0.11) - P1[:, 2]) / 0.05, 0, 1)
    wv = front * vert * head
    dworld = np.zeros_like(P1)
    dworld[:, 0] = disp[:, 0] * dep / cam.f * wv
    dworld[:, 2] = -disp[:, 1] * dep / cam.f * wv
    # olhos e dentes andam rígidos (deslocamento do centro), senão o globo deforma
    for grp in ('helper-l-eye', 'helper-r-eye', 'helper-upper-teeth', 'helper-lower-teeth', 'helper-tongue'):
        g = group_set(body, grp)
        if g.any():
            c = P1[g].mean(0)
            cuv, cd = cam.project_np(c[None])
            dc = tps(cuv / res)[0] * res
            dworld[g] = [dc[0] * cd[0] / cam.f, 0.0, -dc[1] * cd[0] / cam.f]
    kb = body.shape_key_add(name='face_residual', from_mix=False)
    kb.data.foreach_set('co', (basis + dworld).ravel())
    kb.value = 1.0
    P2 = shape_mix(body)
    q2, _ = cam.project_np(model_pts(P2))
    io = np.linalg.norm(tgt[ids.index(33)] - tgt[ids.index(263)])
    err = np.linalg.norm(q2 - tgt, axis=1)
    report['faceFit']['rmsAfterTpsPx'] = round(float(np.sqrt((err[sel] ** 2).mean())), 2)
    report['faceFit']['meanErrPctInterocular'] = round(float(100 * err[sel].mean() / io), 2)
    report['faceFit']['maxResidualMm'] = round(float(np.abs(dworld).max() * 1000), 1)
    print('[face] ajuste:', json.dumps(report['faceFit'], ensure_ascii=False))
    Rinv = np.linalg.inv(Rm)
    return {'cam': cam, 'Rinv': Rinv, 't': t, 'res': res, 'eye_c': eye_c, 'chin_z': float(chin_z)}


def prepare_photo(F):
    """F1/F2/F7: MediaPipe na foto (landmarks + segmentação) e textura do jogo (tools/face/texture.ts)."""
    TMP.mkdir(parents=True, exist_ok=True)
    photo = ROOT / F['photo']
    ana = TMP / 'photo.json'
    res = run_mediapipe([photo], ana, seg=True)[0]
    if not res['found']:
        raise RuntimeError('MediaPipe não achou o rosto na foto')
    rep = TMP / 'texture.json'
    r = subprocess.run(f'npx tsx tools/face/texture.ts "{photo}" "{ana}" "{ROOT / F["out"]}" "{rep}"', cwd=str(ROOT), shell=True, capture_output=True, text=True, encoding='utf-8')
    if r.returncode != 0:
        raise RuntimeError(f'textura do rosto falhou: {r.stderr[-2000:]}')
    tex = json.loads(rep.read_text(encoding='utf-8'))
    tex['validPath'] = str(TMP / 'texture_valid.png')
    return res, tex


def load_valid(path):
    """Máscara de validade da foto (1 = pessoa, 0 = fundo/roupa) como array (H, W), linha 0 = topo."""
    img = bpy.data.images.load(str(path), check_existing=False)
    W, H = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)[::-1, :, 0]
    bpy.data.images.remove(img)
    return px


def sample_valid(valid, px):
    H, W = valid.shape
    x = np.clip(np.round(px[:, 0]).astype(int), 0, W - 1)
    y = np.clip(np.round(px[:, 1]).astype(int), 0, H - 1)
    return valid[y, x]


def _qa_material(name, img, mode, base=(0.6, 0.4, 0.3)):
    """Material de conferência (emissão = cor sem luz): 'skin' mistura base↔foto pela máscara (alfa do atributo);
    'pelt' = foto com alfa (foto.a × alfa de borda G); 'photo' = foto pura."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    emi = nt.nodes.new('ShaderNodeEmission')
    uv = nt.nodes.new('ShaderNodeUVMap')
    uv.uv_map = 'FaceProj'
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    tex.extension = 'EXTEND'
    nt.links.new(uv.outputs['UV'], tex.inputs['Vector'])
    attr = nt.nodes.new('ShaderNodeVertexColor')
    if mode == 'skin':
        mix = nt.nodes.new('ShaderNodeMixRGB')
        mix.inputs['Color1'].default_value = (*base, 1.0)
        nt.links.new(attr.outputs['Alpha'], mix.inputs['Fac'])
        nt.links.new(tex.outputs['Color'], mix.inputs['Color2'])
        nt.links.new(mix.outputs['Color'], emi.inputs['Color'])
        nt.links.new(emi.outputs['Emission'], out.inputs['Surface'])
    elif mode == 'pelt':
        nt.links.new(tex.outputs['Color'], emi.inputs['Color'])
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(attr.outputs['Color'], sep.inputs['Color'])
        mul = nt.nodes.new('ShaderNodeMath')
        mul.operation = 'MULTIPLY'
        nt.links.new(tex.outputs['Alpha'], mul.inputs[0])
        nt.links.new(sep.outputs['Green'], mul.inputs[1])
        tr = nt.nodes.new('ShaderNodeBsdfTransparent')
        mx = nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(mul.outputs['Value'], mx.inputs['Fac'])
        nt.links.new(tr.outputs['BSDF'], mx.inputs[1])
        nt.links.new(emi.outputs['Emission'], mx.inputs[2])
        nt.links.new(mx.outputs['Shader'], out.inputs['Surface'])
        m.blend_method = 'CLIP'
    else:
        nt.links.new(tex.outputs['Color'], emi.inputs['Color'])
        nt.links.new(emi.outputs['Emission'], out.inputs['Surface'])
    return m


def qa_face(objs, fit, tex_path, out_dir, skin_lin):
    """F11: renders de conferência com a foto projetada (sem luz): pela câmera do ajuste, 3/4 e perfil, + MediaPipe
    no render frontal e 3/4 → erro de landmarks normalizado pela distância interocular. Devolve métricas."""
    scn = bpy.context.scene
    img = bpy.data.images.load(str(tex_path), check_existing=True)
    img.colorspace_settings.name = 'sRGB'
    img.alpha_mode = 'CHANNEL_PACKED'  # alfa = máscara de pelo, independente da cor
    saved = {o.name: list(o.data.materials) for o in objs}
    for o in objs:
        o.hide_render = False
        mode = 'pelt' if o.name in ('Hair', 'Beard') else 'skin' if o.name == 'Body' else 'photo' if o.name.startswith('Eye') else None
        o.data.materials.clear()
        o.data.materials.append(_qa_material(f'QA_{o.name}', img, mode, skin_lin) if mode else _qa_material(f'QA_{o.name}', img, 'skin', skin_lin))
        if mode is None:
            o.hide_render = True
    for o in scn.objects:
        if o.type == 'MESH' and o not in objs:
            o.hide_render = True
    scn.render.engine = 'CYCLES'
    scn.cycles.samples = 8
    scn.cycles.use_denoising = False
    scn.render.film_transparent = False
    if scn.world is None:
        scn.world = bpy.data.worlds.new('QA')
    scn.world.use_nodes = True
    scn.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.85, 0.85, 0.85, 1)
    scn.view_settings.view_transform = 'Standard'
    res = fit['res']
    scn.render.resolution_x = scn.render.resolution_y = res
    cam = fit['cam']
    # a câmera do ajuste vive no espaço "antes da pose T"; leva para o espaço atual
    R, t = fit.get('post_to_pre', (np.eye(3), np.zeros(3)))
    Rinv = R.T
    pivot_pre = np.array([cam.target.x, cam.target.y + 0.09, cam.target.z])
    pivot = (pivot_pre - t) @ Rinv.T
    bcam = cam.blender_camera('FaceQA')
    shots = {}
    for nm, ang in (('front', 0), ('three_quarter', 35), ('profile', 85)):
        a = math.radians(ang)
        # gira a posição da câmera em torno do eixo vertical que passa pelo centro da cabeça
        rel = np.array(cam.pos) - pivot_pre
        rel = np.array([rel[0] * math.cos(a) - rel[1] * math.sin(a), rel[0] * math.sin(a) + rel[1] * math.cos(a), rel[2]])
        pos_pre = pivot_pre + rel
        bcam.location = Vector(((pos_pre - t) @ Rinv.T).tolist())
        bcam.rotation_euler = (math.radians(90), 0, a)
        scn.camera = bcam
        path = Path(out_dir) / f'face_qa_{nm}.png'
        scn.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        shots[nm] = path
    for o in objs:
        o.data.materials.clear()
        for m in saved[o.name]:
            o.data.materials.append(m)
    for o in scn.objects:
        o.hide_render = False
    det = run_mediapipe([shots['front'], shots['three_quarter']], TMP / 'qa_render.json')
    return shots, det


def kabsch(A, B):
    """Transformação rígida (R, t) que leva os pontos A → B (mínimos quadrados)."""
    ca, cb = A.mean(0), B.mean(0)
    H = (A - ca).T @ (B - cb)
    U, _S, Vt = np.linalg.svd(H)
    d = np.sign(np.linalg.det(Vt.T @ U.T))
    R = Vt.T @ np.diag([1, 1, d]) @ U.T
    return R, cb - ca @ R.T


def photo_px(fit, P):
    """Pixel da foto de cada ponto (N,3) pela câmera estimada + alinhamento inverso. Se a cabeça andou depois do
    ajuste (pose T), `post_to_pre` leva o ponto de volta ao espaço em que a câmera foi estimada."""
    if 'post_to_pre' in fit:
        R, t = fit['post_to_pre']
        P = P @ R.T + t
    q, _ = fit['cam'].project_np(P)
    return (q - fit['t']) @ fit['Rinv'].T
