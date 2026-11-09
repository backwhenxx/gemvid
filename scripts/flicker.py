# Поиск мерцания: пиксель «прыгнул и вернулся» (кадр t резко отличается от t-1 и t+1, а те похожи между собой)
import subprocess,sys,numpy as np
v=sys.argv[1]; W,H=540,960
p=subprocess.Popen(['ffmpeg','-v','error','-i',v,'-vf',f'scale={W}:{H}','-pix_fmt','gray','-f','rawvideo','-'],stdout=subprocess.PIPE)
fr=[];res=[]
i=0
while True:
    b=p.stdout.read(W*H)
    if len(b)<W*H: break
    fr.append(np.frombuffer(b,np.uint8).astype(np.int16).reshape(H,W))
    if len(fr)==3:
        a,c,d=fr
        m=(np.abs(c-a)>22)&(np.abs(c-d)>22)&(np.abs(d-a)<8)
        m[520:610,:]=False  # субтитры
        res.append(int(m.sum()))
        fr.pop(0)
    i+=1
res=np.array(res)
sec=[int(res[k:k+30].sum()) for k in range(0,len(res),30)]
print('по секундам (число мерцающих пикселей):')
print(' '.join(f'{k}:{x}' for k,x in enumerate(sec)))
print('всего',int(res.sum()),'макс/с',max(sec))
