"""Blender (фон): Rocketbox FBX → GLB.  blender -b -P rb_convert.py -- avatar|anim src.fbx dst.glb"""
import bpy, sys, os
mode, src, dst = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src, use_anim=(mode == 'anim'), ignore_leaf_bones=False, automatic_bone_orientation=False)
if mode == 'avatar':
    tex = os.path.join(os.path.dirname(os.path.dirname(src)), 'Textures')
    if os.path.isdir(tex):
        bpy.ops.file.find_missing_files(directory=tex)
    for m in bpy.data.materials:
        if not m.use_nodes:
            continue
        nt = m.node_tree
        bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not bsdf:
            continue
        # спекуляр 3ds Max даёт пластик — делаем кожу/ткань матовыми
        bsdf.inputs['Roughness'].default_value = 0.75
        for l in list(nt.links):
            if l.to_node == bsdf and l.to_socket.name in ('Specular IOR Level', 'Roughness', 'Metallic'):
                nt.links.remove(l)
        if 'Specular IOR Level' in bsdf.inputs:
            bsdf.inputs['Specular IOR Level'].default_value = 0.3
        alpha = any(l.to_node == bsdf and l.to_socket.name == 'Alpha' for l in nt.links)
        names = ' '.join(n.image.name.lower() for n in nt.nodes if n.type == 'TEX_IMAGE' and n.image)
        if alpha or 'opacity' in names:
            m.blend_method = 'CLIP'
            m.alpha_threshold = 0.5
    for o in bpy.data.objects:  # лишние лицевые/служебные меши
        if o.type == 'MESH' and o.name.lower().startswith(('bip', 'dummy')):
            bpy.data.objects.remove(o)
    bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=85,
                              export_animations=False, export_skins=True, export_morph=False, export_yup=True)
else:
    name = os.path.basename(src).split('.')[0]
    for o in list(bpy.data.objects):
        if o.type == 'MESH':
            bpy.data.objects.remove(o)
    for a in bpy.data.actions:
        a.name = name
    bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_animations=True, export_animation_mode='ACTIONS',
                              export_skins=True, export_morph=False, export_yup=True, export_force_sampling=True)
