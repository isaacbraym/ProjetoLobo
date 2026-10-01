"""Inspeção (descartável) de FBX do Mixamo: malhas, ossos, repouso, quadros, deslocamento do quadril."""
import json
import sys
from pathlib import Path

import bpy

files = sys.argv[sys.argv.index('--') + 1:]
out = {}
for f in files:
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    bpy.ops.import_scene.fbx(filepath=f, automatic_bone_orientation=False, ignore_leaf_bones=True)
    arm = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)
    meshes = [o.name for o in bpy.data.objects if o.type == 'MESH']
    info = {'meshes': meshes, 'objects': [o.name + ':' + o.type for o in bpy.data.objects]}
    if arm:
        info['arm_scale'] = list(arm.scale)
        info['arm_rot'] = list(arm.rotation_euler)
        info['bones'] = len(arm.data.bones)
        info['names'] = [b.name for b in arm.data.bones][:12]
        mw = arm.matrix_world
        def h(n):
            b = arm.data.bones.get(n)
            return [round(x, 3) for x in (mw @ b.head_local)] if b else None
        for n in ('mixamorig:Hips', 'mixamorig:LeftArm', 'mixamorig:LeftHand', 'mixamorig:LeftUpLeg', 'mixamorig:LeftFoot', 'mixamorig:Head', 'mixamorig:LeftToeBase'):
            info[n] = h(n)
        act = arm.animation_data.action if arm.animation_data else None
        if act:
            info['action'] = act.name
            info['frame_range'] = list(act.frame_range)
            info['fps'] = bpy.context.scene.render.fps
            scn = bpy.context.scene
            pb = arm.pose.bones.get('mixamorig:Hips')
            p0 = None
            pts = []
            for fr in range(int(act.frame_range[0]), int(act.frame_range[1]) + 1, max(1, int((act.frame_range[1] - act.frame_range[0]) / 6))):
                scn.frame_set(fr)
                p = mw @ pb.head
                pts.append([round(x, 3) for x in p])
            info['hips_path'] = pts
    out[Path(f).name] = info
Path('C:/PROJETOS/Lobo/.agent-tmp/mixamo_probe.json').write_text(json.dumps(out, indent=1), encoding='utf-8')
print('PROBE_OK')
