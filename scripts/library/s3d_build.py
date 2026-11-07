"""sand3d (Apache-2.0, поверх Blender): программы library/sand3d/<имя>.py с функцией build() → out/library/s3/<имя>.glb."""
import importlib.util, os, sys, traceback
import sand3d as s3d

OUT = 'out/library/s3'
os.makedirs(OUT, exist_ok=True)
names = sys.argv[1:] or [f[:-3] for f in os.listdir('library/sand3d') if f.endswith('.py')]
bad = 0
for n in names:
    try:
        s3d.empty_scene()
        spec = importlib.util.spec_from_file_location(n, f'library/sand3d/{n}.py')
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        s3d.export(mod.build(), f'{OUT}/{n}.glb')
        print('готово', n, os.path.getsize(f'{OUT}/{n}.glb') // 1024, 'КБ')
    except Exception:
        bad += 1
        print('ОШИБКА', n); traceback.print_exc()
sys.exit(1 if bad == len(names) else 0)
