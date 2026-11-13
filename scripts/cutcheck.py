import sys,subprocess,json,numpy as np
v=sys.argv[1]; tl=json.load(open(sys.argv[2])) if len(sys.argv)>2 else None
W,H=135,240
raw=subprocess.run(['ffmpeg','-v','error','-i',v,'-vf',f'scale={W}:{H},format=gray','-f','rawvideo','-'],capture_output=True).stdout
f=np.frombuffer(raw,np.uint8).reshape(-1,H,W).astype(np.float32)
d=np.abs(f[1:]-f[:-1]).mean(axis=(1,2))
fps=30
bounds=[round(s['start']*fps) for s in tl['scenes']] if tl else []
print('кадров',len(f))
# всплески: кадр, где разница в >2.2 раза больше медианы соседних 8 кадров и >1.2
sp=[]
for i in range(4,len(d)-4):
    nb=np.median(np.concatenate([d[i-4:i],d[i+1:i+5]]))
    if d[i]>2.2*max(nb,0.25) and d[i]>1.2: sp.append((i+1,d[i],nb))
for i,a,b in sp:
    near=min(bounds,key=lambda x:abs(x-i)) if bounds else None
    print(f"кадр {i} ({i/fps:.2f} с): скачок {a:.1f} при соседях {b:.1f}" + (f" — граница сцены в {near} ({'да' if abs(near-i)<=1 else 'нет'})" if near is not None else ''))
print('всплесков',len(sp))
if bounds:
    print('у границ сцен (кадр: разница за 3 кадра до, НА границе, 3 после):')
    for b in bounds[1:]:
        if 4<b<len(d)-4: print(f"  {b} ({b/fps:.1f}с): {np.round(d[b-4:b-1],1)} [{d[b-1]:.1f}] {np.round(d[b:b+3],1)}")
