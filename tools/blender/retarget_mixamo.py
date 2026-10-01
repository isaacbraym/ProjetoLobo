"""
Retarget Mixamo (FBX) → esqueleto de runtime (UAL/UE ajustado ao corpo), dentro da sessão do build_character.

Método (os dois esqueletos estão em pose T olhando para −Y): para cada osso mapeado,
  Δ(t) = W_src(t) · W_src_repouso⁻¹      (rotação de mundo do osso-fonte relativa ao repouso)
  W_alvo(t) = Δ(t) · W_alvo_repouso
e convertemos para rotação local (basis) do alvo, pai → filho. A pelve segue o quadril da fonte escalado pela razão
das alturas. Clipes de locomoção têm a translação horizontal média removida (ficam no lugar) e a velocidade medida
vai para o metadado. Também medimos: quadro de maior extensão de mãos/pés (sugestão de impacto), erro de loop,
se o personagem termina deitado.

Arquivos com malha (baixados "With Skin") são aceitos: a malha é descartada. Nomes "Boxing (3)" viram "mx_boxing_3".
"""
import json
import math
import re
from pathlib import Path

import bpy
from mathutils import Quaternion, Vector

MAP_BASE = {
    'Hips': 'pelvis', 'Spine': 'spine_01', 'Spine1': 'spine_02', 'Spine2': 'spine_03', 'Neck': 'neck_01', 'Head': 'Head',
}
for side, s in (('Left', 'l'), ('Right', 'r')):
    MAP_BASE.update({
        f'{side}Shoulder': f'clavicle_{s}', f'{side}Arm': f'upperarm_{s}', f'{side}ForeArm': f'lowerarm_{s}', f'{side}Hand': f'hand_{s}',
        f'{side}UpLeg': f'thigh_{s}', f'{side}Leg': f'calf_{s}', f'{side}Foot': f'foot_{s}', f'{side}ToeBase': f'ball_{s}',
    })
    for f_mx, f_ue in (('Thumb', 'thumb'), ('Index', 'index'), ('Middle', 'middle'), ('Ring', 'ring'), ('Pinky', 'pinky')):
        for i in (1, 2, 3):
            MAP_BASE[f'{side}Hand{f_mx}{i}'] = f'{f_ue}_0{i}_{s}'

LOOP_HINTS = ('idle', 'running', 'run', 'sprint', 'walk', 'strafe', 'crawl', 'breathing', 'kneeling idle', 'praying', 'crying', 'hostage situation idle', 'boxing')
NOT_LOOP = ('to ', 'turn', 'jump', 'roll', 'getting up', 'kneeling down')


def slug(name: str) -> str:
    s = name.lower()
    s = re.sub(r'\((\d+)\)', r'_\1', s)
    s = re.sub(r'[^a-z0-9]+', '_', s).strip('_')
    return 'mx_' + s


def is_loop(stem: str) -> bool:
    n = stem.lower()
    if any(k in n for k in NOT_LOOP):
        return False
    return any(k in n for k in LOOP_HINTS)


def world_rot(arm, mat):
    return (arm.matrix_world @ mat).to_quaternion().normalized()


def retarget_all(tgt, folder: Path, only=None, log=print):
    scn = bpy.context.scene
    fps = scn.render.fps
    tb = tgt.data.bones
    # ordem pai→filho do alvo
    order = []
    def walk(b):
        order.append(b)
        for c in b.children:
            walk(c)
    for b in tb:
        if b.parent is None:
            walk(b)
    trest_w = {b.name: world_rot(tgt, b.matrix_local) for b in tb}
    trest_local = {}
    for b in tb:
        pw = trest_w[b.parent.name] if b.parent else world_rot(tgt, tgt.matrix_world.inverted() @ tgt.matrix_world)
        trest_local[b.name] = (pw.inverted() @ trest_w[b.name]).normalized() if b.parent else trest_w[b.name]
    pel_rest_w = tgt.matrix_world @ tb['pelvis'].head_local
    pel_rest_arm = tb['pelvis'].head_local.copy()
    pel_rest_rot_arm = tb['pelvis'].matrix_local.to_quaternion()
    for pb in tgt.pose.bones:
        pb.rotation_mode = 'QUATERNION'

    files = sorted(f for f in folder.rglob('*.fbx') if 'tpose' not in f.stem.lower().replace('-', '').replace(' ', ''))
    if only:
        files = [f for f in files if f.stem in only]
    meta = {}
    for f in files:
        before = set(bpy.data.objects)
        before_actions = set(bpy.data.actions)
        try:
            bpy.ops.import_scene.fbx(filepath=str(f), automatic_bone_orientation=False, ignore_leaf_bones=True)
        except Exception as e:  # arquivo corrompido/incompleto (ainda subindo?)
            log(f'[mixamo] FALHA ao importar {f.name}: {e}')
            continue
        new = [o for o in bpy.data.objects if o not in before]
        src = next((o for o in new if o.type == 'ARMATURE'), None)
        had_mesh = any(o.type == 'MESH' for o in new)
        if not src or not src.animation_data or not src.animation_data.action:
            log(f'[mixamo] sem armature/animação: {f.name}')
            for o in new:
                bpy.data.objects.remove(o, do_unlink=True)
            continue
        act_src = src.animation_data.action
        prefix = next((b.name[:-4] for b in src.data.bones if b.name.endswith('Hips')), 'mixamorig:')
        pairs = [(prefix + k, v) for k, v in MAP_BASE.items() if (prefix + k) in src.data.bones and v in tb]
        srest_w = {s: world_rot(src, src.data.bones[s].matrix_local) for s, _ in pairs}
        hips = prefix + 'Hips'
        s_hips_rest = src.matrix_world @ src.data.bones[hips].head_local
        k_scale = pel_rest_w.z / max(1e-4, s_hips_rest.z)
        f0, f1 = int(act_src.frame_range[0]), int(act_src.frame_range[1])
        frames = list(range(f0, f1 + 1))
        n = len(frames)
        tq = {b.name: [] for b in order}
        pel = []
        ends = {'hand_l': [], 'hand_r': [], 'foot_l': [], 'foot_r': []}
        spine = []
        src_map = dict(pairs)
        inv_map = {v: k for k, v in pairs}
        spb = src.pose.bones
        for fr in frames:
            scn.frame_set(fr)
            tw = {}
            for b in order:
                name = b.name
                pw = tw[b.parent.name] if b.parent else None
                s = inv_map.get(name)
                if s:
                    sw = world_rot(src, spb[s].matrix)
                    w = (sw @ srest_w[s].inverted() @ trest_w[name]).normalized()
                else:
                    w = (pw @ trest_local[name]).normalized() if pw is not None else trest_w[name]
                tw[name] = w
                if b.parent:
                    pose_local = (pw.inverted() @ w).normalized()
                    basis = (trest_local[name].inverted() @ pose_local).normalized()
                else:
                    basis = Quaternion()
                prev = tq[name][-1] if tq[name] else None
                if prev is not None and prev.dot(basis) < 0:
                    basis.negate()
                tq[name].append(basis)
            hp = src.matrix_world @ spb[hips].head
            pel.append((hp - s_hips_rest) * k_scale)
            for e, sname in (('hand_l', 'LeftHand'), ('hand_r', 'RightHand'), ('foot_l', 'LeftFoot'), ('foot_r', 'RightFoot')):
                if prefix + sname in spb:
                    ends[e].append((src.matrix_world @ spb[prefix + sname].head) * k_scale)
            if prefix + 'Spine1' in spb:
                spine.append((src.matrix_world @ spb[prefix + 'Spine1'].head) * k_scale)
        dur = (n - 1) / fps
        loop = is_loop(f.stem)
        travel = Vector((pel[-1].x - pel[0].x, pel[-1].y - pel[0].y, 0))
        speed = travel.length / dur if dur > 0 else 0.0
        if loop:
            # remove a translação horizontal média (fica no lugar); a velocidade vai para o metadado
            for i in range(n):
                t = i / max(1, n - 1)
                pel[i] = Vector((pel[i].x - travel.x * t, pel[i].y - travel.y * t, pel[i].z))
        # sugestão de impacto: maior alcance à frente (−Y) de cada extremidade relativo ao tronco
        hit = {}
        for e, pts in ends.items():
            if len(pts) != n or len(spine) != n:
                continue
            reach = [(-(pts[i].y - spine[i].y)) + (0.0 if e.startswith('hand') else 0.0) for i in range(n)]
            i_max = max(range(n), key=lambda i: reach[i])
            hit[e] = {'t': round(i_max / fps, 3), 'reach': round(reach[i_max], 3)}
        hip_min = min(p.z for p in pel) + pel_rest_w.z
        loop_err = sum((tq[b.name][0].rotation_difference(tq[b.name][-1]).angle) for b in order if b.name in inv_map) / max(1, len(pairs))
        name = slug(f.stem)
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        act.id_root = 'OBJECT'  # o exportador glTF ignora ações sem id_root
        times = [1 + i for i in range(n)]
        for b in order:
            if b.name not in inv_map and b.name != 'root':
                # osso sem fonte: só grava se algum ancestral mapeado (mantém pose de repouso — não precisa curva)
                continue
            path = f'pose.bones["{b.name}"].rotation_quaternion'
            qs = tq[b.name]
            for idx in range(4):
                fc = act.fcurves.new(data_path=path, index=idx, action_group=b.name)
                fc.keyframe_points.add(n)
                co = []
                for i in range(n):
                    co += [times[i], qs[i][idx]]
                fc.keyframe_points.foreach_set('co', co)
                fc.update()
        # pelve: posição desejada (espaço da armature) → location no espaço de repouso do osso
        inv_rot = pel_rest_rot_arm.inverted()
        inv_world = tgt.matrix_world.inverted()
        locs = []
        for i in range(n):
            want_w = pel_rest_w + pel[i]
            want_arm = inv_world @ want_w
            locs.append(inv_rot @ (want_arm - pel_rest_arm))
        for idx in range(3):
            fc = act.fcurves.new(data_path='pose.bones["pelvis"].location', index=idx, action_group='pelvis')
            fc.keyframe_points.add(n)
            co = []
            for i in range(n):
                co += [times[i], locs[i][idx]]
            fc.keyframe_points.foreach_set('co', co)
            fc.update()
        meta[name] = {
            'file': f.name, 'frames': n, 'duration': round(dur, 3), 'loop': loop, 'speed': round(speed, 3),
            'travel': round(travel.length, 3), 'hit': hit, 'endsLying': hip_min < 0.45, 'loopError': round(loop_err, 3),
            'hadMesh': had_mesh,
        }
        # limpa a fonte
        for o in new:
            bpy.data.objects.remove(o, do_unlink=True)
        for a in set(bpy.data.actions) - before_actions:
            if a is not act:
                bpy.data.actions.remove(a)
        log(f'[mixamo] {name}: {n} quadros, {dur:.2f}s, loop={loop}, v={speed:.2f} m/s{" (tinha malha)" if had_mesh else ""}')
    return meta
