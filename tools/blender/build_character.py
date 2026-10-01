"""
Gera um personagem humano a partir de uma receita JSON (data/characters/<id>.json):
corpo MPFB2 por macros/alvos → esqueleto de runtime (UAL/UE) ajustado às juntas do corpo (rotações de repouso
preservadas, DEC-0009) → roupas por casca segmentadas pelos pesos dos ossos → cabelo/barba/olhos/dentes →
export GLB (+ opcionalmente o GLB de animações compartilhado) + renders de conferência + relatório.

Uso:
  BLENDER_USER_RESOURCES=C:/Ferramentas/Blender-spike-profile \
  blender -b --python tools/blender/build_character.py -- --recipe data/characters/marcio.json [--anims]
"""
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import ROOT, UAL_GLB, NAME_MAP, activate, args, clear_scene, material, sha256, srgb, write_report  # noqa: E402
import face_fit as FF  # noqa: E402

A = args()
RECIPE_PATH = ROOT / A.get('recipe', 'data/characters/marcio.json')
R = json.loads(RECIPE_PATH.read_text(encoding='utf-8'))
OUT_GLB = ROOT / R['out']
QA_DIR = ROOT / '.agent-tmp' / 'characters' / R['id']
GENERATOR_VERSION = 1
report: dict = {'id': R['id'], 'recipe': str(RECIPE_PATH.relative_to(ROOT)), 'generatorVersion': GENERATOR_VERSION}


def mpfb_human():
    from bl_ext.user_default.mpfb.services.humanservice import HumanService
    from bl_ext.user_default.mpfb.services.targetservice import TargetService
    body = HumanService.create_human(macro_detail_dict=R['macros'])
    for tname, val in R.get('targets', {}).items():
        path = TargetService.target_full_path(tname)
        if not path:
            print(f'[warn] alvo não encontrado: {tname}')
            continue
        TargetService.load_target(body, path, weight=val, name=tname)
    rig = HumanService.add_builtin_rig(body, 'game_engine')
    return body, rig


def t_pose(body, rig):
    from bl_ext.user_default.mpfb.services.locationservice import LocationService
    from bl_ext.user_default.mpfb.services.rigservice import RigService
    pose = json.loads((Path(LocationService.get_mpfb_data('poses')) / 'game_engine_fk/t-pose.json').read_text(encoding='utf-8'))
    activate(rig, 'POSE')
    RigService.set_pose_from_dict(rig, pose)
    bpy.ops.object.mode_set(mode='OBJECT')
    RigService.apply_pose_as_rest_pose(rig)


def bake_shape_keys(obj):
    """Aplica todos os shape keys (macros/alvos) na malha base."""
    if not obj.data.shape_keys:
        return
    activate(obj)
    obj.shape_key_add(name='__mix__', from_mix=True)
    keys = obj.data.shape_keys.key_blocks
    mix = keys['__mix__']
    for i, v in enumerate(obj.data.vertices):
        v.co = mix.data[i].co
    for k in list(keys):
        obj.shape_key_remove(k)


def split_group(body, group_name: str, new_name: str):
    """Duplica `body` e mantém só os vértices do grupo (helpers do MPFB: olhos, dentes, meia-calça…)."""
    dup = body.copy()
    dup.data = body.data.copy()
    dup.name = new_name
    dup.data.name = new_name
    bpy.context.collection.objects.link(dup)
    for m in list(dup.modifiers):
        if m.type == 'MASK':
            dup.modifiers.remove(m)
    gi = dup.vertex_groups[group_name].index
    bm = bmesh.new()
    bm.from_mesh(dup.data)
    dl = bm.verts.layers.deform.active
    kill = [v for v in bm.verts if gi not in v[dl] or v[dl][gi] < 0.5]
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    bm.to_mesh(dup.data)
    bm.free()
    return dup


def apply_mask(body):
    activate(body)
    for m in [m for m in body.modifiers if m.type == 'MASK']:
        bpy.ops.object.modifier_move_to_index(modifier=m.name, index=0)
        bpy.ops.object.modifier_apply(modifier=m.name)


def import_runtime_armature():
    """Importa o esqueleto UAL (com as 43 ações) e descarta o manequim."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(UAL_GLB))
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == 'ARMATURE')
    for o in new:
        if o.type == 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    arm.name = 'Armature'
    return arm


def fit_armature(arm, mpfb_rig):
    """Move as juntas do esqueleto UAL para as juntas do MPFB mantendo direção e roll de cada osso."""
    src = {}
    for b in mpfb_rig.data.bones:
        name = NAME_MAP.get(b.name, b.name)
        src[name] = (mpfb_rig.matrix_world @ b.head_local, mpfb_rig.matrix_world @ b.tail_local)
    activate(arm, 'EDIT')
    eb = arm.data.edit_bones
    inv = arm.matrix_world.inverted()
    orig = {b.name: (b.head.copy(), b.tail.copy(), b.roll) for b in eb}
    moved = 0
    # pais antes de filhos
    order = []
    def walk(b):
        order.append(b)
        for c in b.children:
            walk(c)
    for b in eb:
        if b.parent is None:
            walk(b)
    for b in order:
        h0, t0, roll = orig[b.name]
        d = (t0 - h0)
        length = d.length
        d.normalize()
        if b.name in src and b.name != 'root':
            head = inv @ src[b.name][0]
            mlen = (src[b.name][1] - src[b.name][0]).length
            new_len = mlen if mlen > 1e-4 else length
            b.head = head
            b.tail = head + d * new_len
            b.roll = roll
            moved += 1
        elif b.parent is not None and b.name != 'root':
            # ossos "leaf" do UAL: seguem a ponta do pai
            p = b.parent
            ph0, pt0, _ = orig[p.name]
            rel = h0 - pt0
            scale = (p.tail - p.head).length / max(1e-5, (pt0 - ph0).length)
            b.head = p.tail + rel * scale
            b.tail = b.head + d * length * scale
            b.roll = roll
    bpy.ops.object.mode_set(mode='OBJECT')
    return moved


def dominant_bone(obj, bone_names):
    names = {g.index: g.name for g in obj.vertex_groups if g.name in bone_names}
    dom = []
    for v in obj.data.vertices:
        best, bw = None, 0.0
        for g in v.groups:
            if g.group in names and g.weight > bw:
                best, bw = names.get(g.group), g.weight
        dom.append(best)
    return dom


def rename_groups(obj):
    for g in obj.vertex_groups:
        if g.name in NAME_MAP:
            g.name = NAME_MAP[g.name]


def bind(obj, arm):
    rename_groups(obj)
    for m in list(obj.modifiers):
        if m.type == 'ARMATURE':
            obj.modifiers.remove(m)
    obj.parent = arm
    obj.matrix_parent_inverse = arm.matrix_world.inverted()
    mod = obj.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm


def shell_from_faces(body, face_pred, name, offset, mat, solidify=0.0, flatten_below=None, cuts=(), smooth=0, smooth_factor=0.5):
    """Casca: duplica faces selecionadas (superconjunto), corta por planos (barras retas), empurra pela normal,
    suaviza (some a anatomia por baixo do tecido) e dá espessura. Pesos de osso preservados."""
    dup = body.copy()
    dup.data = body.data.copy()
    dup.name = name
    dup.data.name = name
    bpy.context.collection.objects.link(dup)
    for m in list(dup.modifiers):
        dup.modifiers.remove(m)
    bm = bmesh.new()
    bm.from_mesh(dup.data)
    bm.faces.ensure_lookup_table()
    keep = set(f for f in bm.faces if face_pred(f))
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f not in keep], context='FACES')
    for (pco, pno) in cuts:
        geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=Vector(pco), plane_no=Vector(pno), clear_outer=True)
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.normal_update()
    for v in bm.verts:
        off = offset(v) if callable(offset) else offset
        v.co += v.normal * off
        if flatten_below is not None and v.co.z < flatten_below:
            v.co.z = max(0.0, v.co.z - 0.004)
    bm.to_mesh(dup.data)
    bm.free()
    dup.data.materials.clear()
    dup.data.materials.append(mat)
    for ca in list(dup.data.color_attributes):
        dup.data.color_attributes.remove(ca)
    activate(dup)
    if smooth > 0:
        sm = dup.modifiers.new('Smooth', 'SMOOTH')
        sm.factor = smooth_factor
        sm.iterations = smooth
        bpy.ops.object.modifier_apply(modifier=sm.name)
    if solidify > 0:
        sd = dup.modifiers.new('Solidify', 'SOLIDIFY')
        sd.thickness = solidify
        sd.offset = -1
        bpy.ops.object.modifier_apply(modifier=sd.name)
    bpy.ops.object.shade_smooth()
    return dup


def transfer_weights(target, source):
    """Copia pesos de osso do corpo para geometria nova (tênis, golas…)."""
    activate(target)
    dt = target.modifiers.new('DT', 'DATA_TRANSFER')
    dt.object = source
    dt.use_vert_data = True
    dt.data_types_verts = {'VGROUP_WEIGHTS'}
    dt.vert_mapping = 'POLYINTERP_NEAREST'
    bpy.ops.object.datalayout_transfer(modifier=dt.name)
    bpy.ops.object.modifier_apply(modifier=dt.name)


def hull_shoe(body, pred_vert, name, mat, offset=0.012):
    """Tênis por casco convexo dos vértices do pé (sem dedos), suavizado e com sola plana."""
    me = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    for v in body.data.vertices:
        if pred_vert(v):
            bm.verts.new(v.co)
    bmesh.ops.convex_hull(bm, input=list(bm.verts))
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * offset
        if v.co.z < 0.012:
            v.co.z = 0.0
    bmesh.ops.subdivide_edges(bm, edges=list(bm.edges), cuts=1, use_grid_fill=True)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    activate(obj)
    sm = obj.modifiers.new('Smooth', 'SMOOTH')
    sm.factor = 0.6
    sm.iterations = 4
    bpy.ops.object.modifier_apply(modifier=sm.name)
    for v in me.vertices:
        if v.co.z < 0.006:
            v.co.z = 0.0
    bpy.ops.object.shade_smooth()
    return obj


def edge_alpha(obj, hops=3, rgb_fn=None):
    """Atributo de cor por vértice: alfa sobe da borda para o centro (barba/cabelo sem corte seco)."""
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    dist = {v.index: (0 if v.is_boundary else None) for v in bm.verts}
    frontier = [v for v in bm.verts if v.is_boundary]
    d = 0
    while frontier and d < hops:
        d += 1
        nxt = []
        for v in frontier:
            for e in v.link_edges:
                o = e.other_vert(v)
                if dist[o.index] is None:
                    dist[o.index] = d
                    nxt.append(o)
        frontier = nxt
    bm.free()
    attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for v in me.vertices:
        dd = dist[v.index]
        a = 1.0 if dd is None else min(1.0, dd / hops)
        r, g, b = rgb_fn(v.co) if rgb_fn else (1.0, 1.0, 1.0)
        attr.data[v.index].color = (r, g, b, a)
    me.color_attributes.active_color = attr



def set_col(obj, rgba):
    """Atributo de cor por vértice 'Col' (RGBA float) a partir de um array (N, 4)."""
    me = obj.data
    for ca in list(me.color_attributes):
        me.color_attributes.remove(ca)
    attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    attr.data.foreach_set('color', np.asarray(rgba, dtype=np.float32).ravel())
    me.color_attributes.active_color = attr


def mesh_arrays(obj):
    me = obj.data
    n = len(me.vertices)
    P = np.empty(n * 3)
    N = np.empty(n * 3)
    me.vertices.foreach_get('co', P)
    me.vertices.foreach_get('normal', N)
    return P.reshape(n, 3), N.reshape(n, 3)


def set_face_uv(obj, fit):
    """UV 'FaceProj' = pixel da foto (câmera estimada no ajuste); o export vira TEXCOORD_1 (uv1 no three.js)."""
    me = obj.data
    P, _ = mesh_arrays(obj)
    px = FF.photo_px(fit, P)
    uv_v = np.stack([px[:, 0] / fit['res'], 1.0 - px[:, 1] / fit['res']], 1)
    uvl = me.uv_layers.get('FaceProj') or me.uv_layers.new(name='FaceProj')
    li = np.empty(len(me.loops), dtype=np.int64)
    me.loops.foreach_get('vertex_index', li)
    uvl.data.foreach_set('uv', uv_v[li].ravel())
    inframe = ((px[:, 0] > 6) & (px[:, 0] < fit['res'] - 6) & (px[:, 1] > 6) & (px[:, 1] < fit['res'] - 6)).astype(float)
    return px, inframe



def edge_hops(obj, hops):
    """Alfa de borda (0 na borda da casca → 1 a `hops` arestas para dentro)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    dist = {v.index: (0 if v.is_boundary else None) for v in bm.verts}
    frontier = [v for v in bm.verts if v.is_boundary]
    d = 0
    while frontier and d < hops:
        d += 1
        nxt = []
        for v in frontier:
            for e in v.link_edges:
                o = e.other_vert(v)
                if dist[o.index] is None:
                    dist[o.index] = d
                    nxt.append(o)
        frontier = nxt
    bm.free()
    return np.array([1.0 if dist[i] is None else min(1.0, dist[i] / hops) for i in range(len(obj.data.vertices))])


def pelt_colors(obj, fit, hops, grey_fn, geo_fn):
    """Casca de pelo com a foto: UV 'FaceProj' + cor por vértice R = peso da cor da foto (de frente), G = alfa de
    borda, B = grisalho do fallback (onde a foto não vê), A = peso do recorte da foto. Runtime: materialLibrary."""
    px, inframe = set_face_uv(obj, fit)
    P, N = mesh_arrays(obj)
    facing = -N[:, 1]
    inframe = inframe * np.clip((FF.sample_valid(fit['valid'], px) - 0.4) / 0.4, 0, 1)  # fora da pessoa: fallback
    w_col = np.clip((facing - 0.3) / 0.35, 0, 1) * inframe  # cor da foto só de frente (senão a foto estica)
    # recorte pela foto só onde ela vê bem; nas laterais a projeção estica a borda do rosto → recorte geométrico
    w_cut = np.clip((facing - 0.22) / 0.25, 0, 1) * inframe
    alpha = edge_hops(obj, hops) * np.clip(geo_fn(P), 0, 1)
    rgba = np.stack([w_col, alpha, np.clip(grey_fn(P), 0, 1), w_cut], 1)
    set_col(obj, rgba)


def face_projection(body, parts, fit, dom, ears):
    """Rosto v2 (WWE 2K, face_fit.py): UV da foto em corpo e olhos + máscara 'FaceMask' (alfa por vértice)."""
    _px, inframe = set_face_uv(body, fit)
    for nm, o in parts.items():
        if nm.startswith('Eye_'):
            set_face_uv(o, fit)
    P, N = mesh_arrays(body)
    facing = -N[:, 1]
    fw = np.clip((facing - 0.12) / 0.33, 0, 1)
    below = np.clip((P[:, 2] - (fit['chin_z'] - 0.05)) / 0.03, 0, 1)
    headish = np.array([NAME_MAP.get(d, d) in ('Head', 'neck_01') for d in dom], dtype=float)
    ear = np.zeros(len(P))
    ear[list(ears)] = 1.0
    a = fw * below * headish * inframe * (1.0 - ear)
    me = body.data
    mask = me.color_attributes.new('FaceMask', 'FLOAT_COLOR', 'POINT')
    rgba = np.ones((len(P), 4))
    rgba[:, 3] = a
    mask.data.foreach_set('color', rgba.astype(np.float32).ravel())
    me.color_attributes.active_color = mask


def main():
    clear_scene()
    body, mrig = mpfb_human()
    fit = tex = None
    F = R.get('face')
    if F and (ROOT / F['photo']).exists():
        photo_res, tex = FF.prepare_photo(F)
        fit = FF.fit_face(body, F, photo_res, report)
        fit['valid'] = FF.load_valid(tex['validPath'])
        report['faceTexture'] = {'out': F['out'], **tex}
    bake_shape_keys(body)
    before, _ = mesh_arrays(body)
    t_pose(body, mrig)
    if fit:
        after, _ = mesh_arrays(body)
        # a pose T move a cabeça (pescoço endireita): a projeção desfaz esse movimento rígido antes de usar a câmera
        hv = (before[:, 2] > fit['eye_c'][2] - 0.06) & (np.abs(before[:, 0]) < 0.1)
        Rk, tk = FF.kabsch(after[hv], before[hv])
        fit['post_to_pre'] = (Rk, tk)
        report['faceFit']['tposeHeadShiftMm'] = round(float(np.abs(after[hv] - before[hv]).max() * 1000), 2)
        report['faceFit']['tposeRigidResidualMm'] = round(float(np.abs(after[hv] @ Rk.T + tk - before[hv]).max() * 1000), 3)
    # helpers úteis antes de aplicar a máscara
    parts = {}
    for grp, nm in [('helper-l-eye', 'Eye_L'), ('helper-r-eye', 'Eye_R'), ('helper-upper-teeth', 'TeethUp'), ('helper-lower-teeth', 'TeethLow'), ('helper-tongue', 'Tongue'), ('helper-l-eyelashes-1', 'Lash_L'), ('helper-r-eyelashes-1', 'Lash_R')]:
        if grp in body.vertex_groups:
            parts[nm] = split_group(body, grp, nm)
    apply_mask(body)
    # remove grupos que não são ossos (mantém region groups para segmentação antes)
    region = {}
    for rg in ('scalp', 'lips', 'ears', 'body'):
        if rg in body.vertex_groups:
            gi = body.vertex_groups[rg].index
            region[rg] = set(v.index for v in body.data.vertices for g in v.groups if g.group == gi and g.weight > 0.5)

    bones = {b.name for b in mrig.data.bones}
    arm = import_runtime_armature()
    report['joints_moved'] = fit_armature(arm, mrig)

    # ---------- segmentação por osso dominante ----------
    dom = dominant_bone(body, bones)
    co = [v.co.copy() for v in body.data.vertices]
    ub = {b.name: (arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local) for b in arm.data.bones}

    def along(vi, bone):
        h, t = ub[bone]
        d = t - h
        return (co[vi] - h).dot(d) / max(1e-6, d.length_squared)

    if fit:
        face_projection(body, parts, fit, dom, region.get('ears', set()))
    face_skin = tuple(c * R['face'].get('skinGain', 0.9) for c in tex['skinLin']) if fit else None
    pelvis_z = ub['pelvis'][0].z
    ankle_z = R['clothes'].get('ankleZ', 0.12)
    sleeve = R['clothes'].get('sleeve', 0.55)  # fração do braço coberta pela manga
    torso_bones = {'spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r', 'neck_01'}

    def vert_class(vi):
        b = dom[vi]
        if b in (None,):
            return 'skin'
        b = NAME_MAP.get(b, b)
        if b in ('foot_l', 'foot_r', 'ball_l', 'ball_r'):
            return 'shoe'
        if b in ('calf_l', 'calf_r') and co[vi].z < ankle_z:
            return 'shoe'
        if b in ('thigh_l', 'thigh_r', 'calf_l', 'calf_r'):
            return 'pants'
        if b == 'pelvis':
            return 'pants' if co[vi].z < pelvis_z + 0.07 else 'shirt'
        if b in torso_bones:
            if b == 'neck_01':
                return 'skin'
            return 'shirt'
        if b in ('upperarm_l', 'upperarm_r'):
            return 'shirt' if along(vi, b) < sleeve else 'skin'
        return 'skin'

    vclass = [vert_class(i) for i in range(len(co))]

    def face_is(cls, frac=0.5):
        def pred(f):
            n = sum(1 for v in f.verts if vclass[v.index] == cls)
            return n / len(f.verts) >= frac
        return pred

    C = R['colors']
    m_skin = material('M_Skin', face_skin if face_skin else srgb(C['skin']), 0.55)
    m_lips = material('M_Lips', srgb(C.get('lips', '#a0625a')), 0.45)
    m_shirt = material(R['clothes'].get('shirtMaterial', 'M_Polo'), srgb(C['shirt']), 0.85)
    m_pants = material(R['clothes'].get('pantsMaterial', 'M_Jeans'), srgb(C['pants']), 0.8)
    m_shoe = material(R['clothes'].get('shoeMaterial', 'M_Shoes'), srgb(C['shoes']), 0.5)
    # rosto v2: cor-base de cabelo/barba amostrada da foto (onde a foto não vê, ex.: nuca e embaixo do queixo)
    m_hair = material('M_Hair', tuple(tex['hairTop']) if fit else srgb(C['hair']), 0.45)
    m_beard = material('M_Beard', tuple(tex['beardChin']) if fit else srgb(C['beard']), 0.7)
    m_eye = material('M_Eye', srgb(C.get('eye', '#e8e2da')), 0.15)
    m_teeth = material('M_Teeth', srgb('#e6dccb'), 0.3)
    m_tongue = material('M_Tongue', srgb('#9a4a48'), 0.5)
    m_lash = material('M_Lash', srgb('#16110e'), 0.6)

    # ---------- cascas de roupa (cortes por plano = barras retas) ----------
    cl = R['clothes']
    belly = cl.get('bellyOffset', 0.0)
    hem_z = pelvis_z + cl.get('hemAbovePelvis', 0.0)
    waist_z = pelvis_z + cl.get('waistAbovePelvis', 0.06)
    neck_z = ub['neck_01'][0].z - 0.01
    long_sleeve = bool(cl.get('longSleeve'))
    arm_cuts = []
    for side in ('l', 'r'):
        bname = f'lowerarm_{side}' if long_sleeve else f'upperarm_{side}'
        h, t = ub[bname]
        d = (t - h).normalized()
        frac = cl.get('cuff', 0.88) if long_sleeve else sleeve
        arm_cuts.append((tuple(h + (t - h) * frac), tuple(d)))
    shirt_bones = torso_bones | {'pelvis', 'upperarm_l', 'upperarm_r'} | ({'lowerarm_l', 'lowerarm_r'} if long_sleeve else set())

    def any_dom(f, names):
        return any(NAME_MAP.get(dom[v.index], dom[v.index]) in names for v in f.verts)

    shirt = shell_from_faces(
        body, lambda f: any_dom(f, shirt_bones), 'Shirt',
        lambda v: cl['shirtOffset'] + (belly if (v.co.y < ub['spine_01'][0].y - 0.04 and v.co.z < ub['spine_03'][0].z) else 0),
        m_shirt, solidify=0.004, smooth=6, smooth_factor=0.45,
        cuts=[((0, 0, hem_z), (0, 0, -1)), ((0, -0.03, neck_z + cl.get('collarHeight', 0.035)), (0, -cl.get('collarSlope', 0.75), 1))] + arm_cuts)
    pants = shell_from_faces(
        body, lambda f: any_dom(f, {'pelvis', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r'}), 'Pants', cl['pantsOffset'],
        m_pants, solidify=0.003, smooth=14, smooth_factor=0.55,
        cuts=[((0, 0, waist_z), (0, 0, 1)), ((0, 0, ankle_z), (0, 0, -1))])
    shoes_l = hull_shoe(body, lambda v: v.co.x > 0.02 and v.co.z < ankle_z + 0.035 and abs(v.co.x) < 0.2, 'Shoe_L', m_shoe, cl.get('shoeOffset', 0.012))
    shoes_r = hull_shoe(body, lambda v: v.co.x < -0.02 and v.co.z < ankle_z + 0.035 and abs(v.co.x) < 0.2, 'Shoe_R', m_shoe, cl.get('shoeOffset', 0.012))

    # ---------- cabelo e barba ----------
    head_vs = [i for i in range(len(co)) if NAME_MAP.get(dom[i], dom[i]) == 'Head']
    hz = [co[i].z for i in head_vs]
    head_top, head_bot = max(hz), min(hz)
    nose_i = min(head_vs, key=lambda i: co[i].y)  # mais à frente (-Y)
    nose = co[nose_i]
    lips = region.get('lips', set())
    lips_z = sum(co[i].z for i in lips) / max(1, len(lips)) if lips else nose.z - 0.04
    hair_cfg = R.get('hair') or {}
    scalp = region.get('scalp', set())
    hl_y = nose.y + hair_cfg.get('hairlineBack', 0.05)
    hair = None
    beard = None
    if fit:
        # ---- rosto v2: cascas com cor e alfa vindos da foto (linha do cabelo, entradas, barba exata) ----
        ears = region.get('ears', set())
        ear_pts = [co[i] for i in ears]
        ear_front_y = min(p.y for p in ear_pts) if ear_pts else nose.y + 0.09
        ear_top_z = max(p.z for p in ear_pts) if ear_pts else fit['eye_c'][2]
        nape_z = (min(p.z for p in ear_pts) - 0.012) if ear_pts else head_bot + 0.05
        brow_z = fit['eye_c'][2] + 0.022
        chin_z = fit['chin_z']
        report['faceFit']['hairBounds'] = {'earFrontY': round(ear_front_y, 4), 'napeZ': round(nape_z, 4), 'browZ': round(float(brow_z), 4)}
        if R.get('hair'):
            hc = R['hair']

            def hair_pred(f):
                if any(v.index in ears for v in f.verts) or not any_dom(f, {'Head'}):
                    return False
                c = f.calc_center_median()
                if c.z < nape_z:
                    return False
                if c.y > ear_front_y + 0.01:
                    return True  # atrás das orelhas: laterais de trás e nuca
                if c.z < nose.z:
                    return False  # bochecha abaixo do nariz é da barba
                if abs(c.x) < 0.058 and c.z < brow_z:
                    return False  # olhos/nariz
                return True

            hair = shell_from_faces(body, hair_pred, 'Hair',
                                    lambda v: hc.get('thickness', 0.004) + max(0.0, v.co.z - (head_top - 0.07)) * hc.get('volumeTop', 0.12),
                                    m_hair, solidify=0.0, smooth=1, smooth_factor=0.3)
            ear_lobe_z = nape_z + 0.012

            def hair_geo(P):
                # costeleta (faixa de ~2 cm na frente da orelha até o lóbulo) + tudo acima do topo da orelha ou atrás dela
                behind = np.clip((P[:, 1] - (ear_front_y - 0.004)) / 0.008, 0, 1)
                above = np.clip((P[:, 2] - (ear_top_z - 0.004)) / 0.008, 0, 1)
                burn = np.clip((P[:, 1] - (ear_front_y - 0.022)) / 0.006, 0, 1) * np.clip((P[:, 2] - ear_lobe_z) / 0.008, 0, 1)
                return np.maximum.reduce([behind, above, burn])

            pelt_colors(hair, fit, hops=2, grey_fn=lambda P: 0.55 * np.clip((ear_top_z + 0.01 - P[:, 2]) / 0.05, 0, 1), geo_fn=hair_geo)
        if R.get('beard'):
            bc = R['beard']

            def beard_pred(f):
                if any(v.index in lips or v.index in ears for v in f.verts):
                    return False
                if not any_dom(f, {'Head', 'neck_01'}):
                    return False
                c = f.calc_center_median()
                if c.z > nose.z - 0.012 or c.y > ear_front_y + bc.get('backReach', 0.005) or f.normal.y > 0.25:
                    return False
                return c.z > chin_z - bc.get('neckDepth', 0.045)

            def beard_off(v):
                # fina onde está de frente (alinha com a foto, sem paralaxe); o volume cresce para baixo, sob o queixo
                low = max(0.0, min(1.0, (lips_z - v.co.z) / max(0.01, lips_z - chin_z)))
                down = max(0.0, min(1.0, -v.normal.z * 1.4))
                return bc.get('thickness', 0.0045) + bc.get('chinVolume', 0.006) * low * down

            beard = shell_from_faces(body, beard_pred, 'Beard', beard_off, m_beard, solidify=0.0, smooth=1, smooth_factor=0.3)
            lip_y = min(co[i].y for i in lips) if lips else nose.y + 0.02

            def beard_geo(P):
                # linha da bochecha: do lóbulo da orelha (costeleta) descendo até o canto da boca
                t = np.clip((P[:, 1] - lip_y) / max(0.01, ear_front_y - lip_y), 0, 1)
                zline = (lips_z + 0.018) * (1 - t) + (nape_z + 0.012) * t
                return np.clip((zline + 0.005 - P[:, 2]) / 0.01, 0, 1)

            pelt_colors(beard, fit, hops=3, grey_fn=lambda P: np.clip((lips_z - 0.012 - P[:, 2]) / 0.03, 0, 1), geo_fn=beard_geo)
    else:
        hair = None
        if R.get('hair'):
          hair = shell_from_faces(
            body, lambda f: any(v.index in scalp for v in f.verts) or (any_dom(f, {'Head'}) and f.calc_center_median().z > head_top - 0.09), 'Hair',
            lambda v: hair_cfg.get('thickness', 0.008) + max(0.0, (v.co.z - (head_top - 0.07))) * hair_cfg.get('volumeTop', 0.25),
            m_hair, solidify=0.002, smooth=2, smooth_factor=0.4,
            cuts=[((0, hl_y, head_top - 0.03), (0, -1, -0.45)), ((0, 0, head_bot + (head_top - head_bot) * hair_cfg.get('sideBottom', 0.45)), (0, 0, -1))])
          head_cy = nose.y + 0.09  # centro aproximado da cabeça em profundidade
          def hair_front(p):
              f = max(0.0, min(1.0, (head_cy - p.y) / 0.07 + 0.35))
              return (f, f, f)
          edge_alpha(hair, hops=2, rgb_fn=hair_front)

        beard_cfg = R.get('beard')
        beard = None
        if beard_cfg:
            cx_back = nose.y + beard_cfg.get('backDepth', 0.085)
            top_z = lips_z + beard_cfg.get('aboveLips', 0.012)
            mus_z = min(lips_z + beard_cfg.get('mustache', 0.03), nose.z - 0.022)

            def beard_pred(f):
                c = f.calc_center_median()
                if any(v.index in lips for v in f.verts):
                    return False
                if not any_dom(f, {'Head', 'neck_01'}):
                    return False
                if c.y > cx_back or c.z > mus_z:
                    return False
                if c.z > top_z and abs(c.x) > 0.032:
                    return False
                if c.z < head_bot - beard_cfg.get('neckDepth', 0.01):
                    return False
                return True

            beard = shell_from_faces(body, beard_pred, 'Beard', beard_cfg.get('thickness', 0.006), m_beard, solidify=0.0, smooth=1, smooth_factor=0.3)
            chin_z = head_bot

            def beard_rgb(p):
                t = max(0.0, min(1.0, (p.z - chin_z) / max(0.01, (mus_z - chin_z))))
                side = min(1.0, abs(p.x) / 0.07)
                k = 1.0 - 0.55 * max(t * 0.8, side * 0.7)
                return (k, k, k)

            edge_alpha(beard, hops=3, rgb_fn=beard_rgb)

    # ---------- corpo: lábios, esconde pele coberta ----------
    bm = bmesh.new()
    bm.from_mesh(body.data)
    def inside_shirt(v):
        b = NAME_MAP.get(dom[v.index], dom[v.index]) if v.index < len(dom) else None
        if b not in shirt_bones or v.co.z < hem_z + 0.02 or v.co.z > neck_z - 0.01:
            return False
        if not long_sleeve and b in ('upperarm_l', 'upperarm_r') and along(v.index, b) > sleeve - 0.08:
            return False
        if long_sleeve and b in ('lowerarm_l', 'lowerarm_r') and along(v.index, b) > cl.get('cuff', 0.88) - 0.1:
            return False
        return True

    def inside_pants(v):
        b = NAME_MAP.get(dom[v.index], dom[v.index]) if v.index < len(dom) else None
        return b in ('pelvis', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r') and ankle_z + 0.03 < v.co.z < waist_z - 0.02

    def inside_shoe(v):
        return v.co.z < ankle_z - 0.01

    covered = [f for f in bm.faces if all(inside_shirt(v) or inside_pants(v) or inside_shoe(v) for v in f.verts)]
    bmesh.ops.delete(bm, geom=covered, context='FACES')
    bm.to_mesh(body.data)
    bm.free()
    body.data.materials.clear()
    body.data.materials.append(m_skin)
    body.data.materials.append(m_lips)
    body.name = 'Body'
    body.data.name = 'Body'
    # índice de vértice mudou após deletar faces: recalcula lábios por posição aproximada
    for p in body.data.polygons:
        c = p.center
        if not face_skin and abs(c.z - lips_z) < 0.011 and abs(c.x) < 0.028 and c.y < nose.y + 0.03:
            p.material_index = 1

    for nm, obj in parts.items():
        obj.data.materials.clear()
        obj.data.materials.append({'Eye_L': m_eye, 'Eye_R': m_eye, 'TeethUp': m_teeth, 'TeethLow': m_teeth, 'Tongue': m_tongue}.get(nm, m_lash))

    # tênis: pesos explícitos pé/ponta (robusto; a transferência por proximidade falhava após apagar os pés)
    for shoe, side in ((shoes_l, 'l'), (shoes_r, 'r')):
        fh, ft = ub[f'foot_{side}']
        bh, bt = ub[f'ball_{side}']
        g_foot = shoe.vertex_groups.new(name=f'foot_{side}')
        g_ball = shoe.vertex_groups.new(name=f'ball_{side}')
        for v in shoe.data.vertices:
            # frente do pé = -Y; mistura suave perto da junta da ponta
            t = max(0.0, min(1.0, (bh.y - v.co.y) / 0.04 + 0.5))
            if t < 1.0:
                g_foot.add([v.index], 1.0 - t, 'REPLACE')
            if t > 0.0:
                g_ball.add([v.index], t, 'REPLACE')
    meshes = [body, shirt, pants, shoes_l, shoes_r] + ([hair] if hair else []) + ([beard] if beard else []) + list(parts.values())
    for obj in meshes:
        for g in [g for g in obj.vertex_groups if g.name not in bones and NAME_MAP.get(g.name, g.name) not in bones]:
            obj.vertex_groups.remove(g)
        bind(obj, arm)
        activate(obj)
        bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
        bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
        bpy.ops.object.shade_smooth()
    bpy.data.objects.remove(mrig, do_unlink=True)

    # ---------- orçamento: remove peças invisíveis e reduz malha (pesos interpolados pelo Blender) ----------
    for nm in R.get('dropParts', []):
        obj = parts.pop(nm, None)
        if obj:
            meshes.remove(obj)
            bpy.data.objects.remove(obj, do_unlink=True)
    ratio = R.get('decimate', 1.0)
    if ratio < 0.999:
        for obj in meshes:
            if obj.name.startswith(('Eye', 'Lash', 'Teeth', 'Tongue', 'Hair', 'Beard')) or len(obj.data.polygons) < 300:
                continue
            activate(obj)
            dec = obj.modifiers.new('Decimate', 'DECIMATE')
            dec.decimate_type, dec.ratio = 'COLLAPSE', ratio
            bpy.ops.object.modifier_move_to_index(modifier=dec.name, index=0)
            bpy.ops.object.modifier_apply(modifier=dec.name)
            bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
            bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)

    # ---------- medidas ----------
    tris = 0
    for obj in meshes:
        obj.data.calc_loop_triangles()
        tris += len(obj.data.loop_triangles)
    allz = [(o.matrix_world @ v.co).z for o in meshes for v in o.data.vertices]
    report['triangles'] = tris
    report['height_m'] = round(max(allz) - min(allz), 4)
    report['bones'] = len(arm.data.bones)
    report['meshes'] = {o.name: len(o.data.vertices) for o in meshes}
    report['materials'] = sorted({m.name for o in meshes for m in o.data.materials})

    # ---------- F11: conferência do rosto (foto projetada, sem luz) + métrica de landmarks ----------
    if fit:
        shots, det = FF.qa_face([o for o in meshes if o.name in ('Body', 'Hair', 'Beard', 'Eye_L', 'Eye_R')], fit, ROOT / R['face']['out'], QA_DIR, tuple(tex['skinLin']))
        photo_lm = np.array(json.loads((FF.TMP / 'photo.json').read_text(encoding='utf-8'))['landmarks'])[:, :2]
        core = [i for i in FF.LEFT_EYE + FF.RIGHT_EYE + FF.NOSE + FF.LIPS + FF.LEFT_BROW + FF.RIGHT_BROW]
        qa = {}
        for d, nm in zip(det, ('front', 'three_quarter')):
            if not d['found']:
                qa[nm] = 'rosto não detectado'
                continue
            L = np.array(d['landmarks'])[:, :2]
            Rm, tt = FF.similarity(L[core], photo_lm[core], np.ones(len(core)))
            err = np.linalg.norm(L[core] @ Rm.T + tt - photo_lm[core], axis=1)
            io = np.linalg.norm(photo_lm[33] - photo_lm[263])
            qa[nm] = {'meanErrPctInterocular': round(float(100 * err.mean() / io), 2), 'maxErrPct': round(float(100 * err.max() / io), 2)}
        report['faceQA'] = {'renders': [str(v.relative_to(ROOT)) for v in shots.values()], **qa}
        print('[face] QA:', json.dumps(qa, ensure_ascii=False))

    # ---------- export ----------
    OUT_GLB.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes + [arm]:
        o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    arm.animation_data_clear() if arm.animation_data else None
    bpy.ops.export_scene.gltf(filepath=str(OUT_GLB), export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
                              export_skins=True, export_def_bones=False, export_animations=False, export_morph=True,
                              export_materials='EXPORT', export_texcoords=True, export_normals=True, export_tangents=False,
                              export_cameras=False, export_lights=False, export_extras=False, export_vertex_color='ACTIVE')
    report['out'] = str(OUT_GLB.relative_to(ROOT))
    report['outHash'] = sha256(OUT_GLB)

    if A.get('anims') and A.get('mixamo'):
        # retarget do Mixamo na MESMA sessão (repouso idêntico ao do personagem exportado)
        from retarget_mixamo import retarget_all
        only = set(A['only'].split('|')) if isinstance(A.get('only'), str) else None
        mx_meta = retarget_all(arm, ROOT / 'assets-src/vendor/mixamo', only=only)
        meta_path = ROOT / 'public/assets/anims/mixamo_meta.json'
        meta_path.write_text(json.dumps(mx_meta, indent=1, ensure_ascii=False), encoding='utf-8')
        report['mixamo'] = {'clips': len(mx_meta), 'meta': str(meta_path.relative_to(ROOT))}
    if A.get('anims'):
        out_anims = ROOT / 'public/assets/anims/humanoid_anims.glb'
        # objeto vazio só com o esqueleto + todas as ações
        bpy.ops.object.select_all(action='DESELECT')
        arm.select_set(True)
        bpy.context.view_layer.objects.active = arm
        if not arm.animation_data:
            arm.animation_data_create()
        arm.animation_data.action = bpy.data.actions[0]
        bpy.ops.export_scene.gltf(filepath=str(out_anims), export_format='GLB', use_selection=True, export_yup=True,
                                  export_skins=True, export_animations=True, export_animation_mode='ACTIONS',
                                  export_force_sampling=True, export_frame_step=1, export_def_bones=False,
                                  export_morph=False, export_materials='NONE', export_cameras=False, export_lights=False)
        report['anims'] = str(out_anims.relative_to(ROOT))
        report['animCount'] = len(bpy.data.actions)

    # ---------- renders de conferência (Workbench) ----------
    QA_DIR.mkdir(parents=True, exist_ok=True)
    scn = bpy.context.scene
    scn.render.engine = 'BLENDER_WORKBENCH'
    scn.display.shading.light = 'STUDIO'
    scn.display.shading.color_type = 'MATERIAL'
    scn.display.shading.show_cavity = True
    scn.render.resolution_x, scn.render.resolution_y = 720, 1080
    cam_data = bpy.data.cameras.new('QA')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = 2.0
    cam = bpy.data.objects.new('QA', cam_data)
    scn.collection.objects.link(cam)
    scn.camera = cam
    views = {'front': ((0, -4, 0.92), (math.radians(90), 0, 0)), 'side': ((4, 0, 0.92), (math.radians(90), 0, math.radians(90))), 'face': ((0, -3, 1.62), (math.radians(90), 0, 0))}
    for nm, (loc, rot) in views.items():
        cam.location = loc
        cam.rotation_euler = rot
        cam_data.ortho_scale = 0.45 if nm == 'face' else 2.0
        scn.render.filepath = str(QA_DIR / f'{nm}.png')
        bpy.ops.render.render(write_still=True)
    walk = next((a for a in bpy.data.actions if a.name.startswith('Walk_Loop')), None)
    if walk:
        if not arm.animation_data:
            arm.animation_data_create()
        arm.animation_data.action = walk
        scn.frame_set(10)
        cam.location = (2.6, -2.6, 0.95)
        cam.rotation_euler = (math.radians(90), 0, math.radians(45))
        cam_data.ortho_scale = 2.1
        scn.render.filepath = str(QA_DIR / 'pose.png')
        bpy.ops.render.render(write_still=True)
    # folhas de conferência de clipes: --qa "mx_boxing|mx_hook" (4 quadros por clipe, vista 3/4)
    if isinstance(A.get('qa'), str):
        cam.location = (2.4, -2.4, 0.95)
        cam.rotation_euler = (math.radians(90), 0, math.radians(45))
        cam_data.ortho_scale = 2.4
        scn.render.resolution_x, scn.render.resolution_y = 360, 480
        for cname in A['qa'].split('|'):
            act = bpy.data.actions.get(cname)
            if not act:
                continue
            arm.animation_data.action = act
            fa, fb = int(act.frame_range[0]), int(act.frame_range[1])
            for k in range(4):
                scn.frame_set(int(fa + (fb - fa) * k / 3))
                scn.render.filepath = str(QA_DIR / 'clips' / f'{cname}_{k}.png')
                bpy.ops.render.render(write_still=True)
    report['qa'] = str(QA_DIR.relative_to(ROOT))
    write_report(QA_DIR / 'report.json', report)
    write_report(ROOT / 'assets-src/characters' / f"{R['id']}.report.json", report)
    print('BUILD_OK', json.dumps({k: report[k] for k in ('triangles', 'height_m', 'bones')}))


main()
