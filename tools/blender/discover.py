"""Descoberta (descartável): grupos de vértices do MPFB2 e pose de repouso do esqueleto UAL."""
import json
import sys
from pathlib import Path

import bpy

UAL = 'C:/PROJETOS/Lobo/public/assets/anims/ual1_src.glb'
out = {}
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)

from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.targetservice import TargetService

body = HumanService.create_human(macro_detail_dict={'gender': 1.0, 'age': 0.67, 'muscle': 0.6, 'weight': 0.75, 'proportions': 0.5, 'height': 0.55, 'cupsize': 0.5, 'firmness': 0.5, 'race': {'asian': 0.2, 'caucasian': 0.6, 'african': 0.2}})
groups = {}
for v in body.data.vertices:
    for g in v.groups:
        n = body.vertex_groups[g.group].name
        groups[n] = groups.get(n, 0) + 1
out['vertex_groups'] = {k: v for k, v in sorted(groups.items()) if not k.startswith('joint')}
out['mods'] = [m.type + ':' + m.name for m in body.modifiers]
out['targetservice'] = [n for n in dir(TargetService) if not n.startswith('_')]
out['humanservice'] = [n for n in dir(HumanService) if not n.startswith('_')]

bpy.ops.import_scene.gltf(filepath=UAL)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
out['ual_armature'] = {'name': arm.name, 'loc': list(arm.location), 'rot': list(arm.rotation_euler), 'scale': list(arm.scale)}
bones = {}
for b in arm.data.bones:
    h = arm.matrix_world @ b.head_local
    t = arm.matrix_world @ b.tail_local
    bones[b.name] = {'head': [round(x, 4) for x in h], 'tail': [round(x, 4) for x in t], 'parent': b.parent.name if b.parent else None}
out['ual_bones'] = bones
out['actions'] = len(bpy.data.actions)
Path('C:/PROJETOS/Lobo/.agent-tmp/discover.json').write_text(json.dumps(out, indent=1), encoding='utf-8')
print('DISCOVER_OK')
