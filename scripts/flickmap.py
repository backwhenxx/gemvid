import subprocess,sys,numpy as np
from PIL import Image
v,t,out=sys.argv[1],float(sys.argv[2]),sys.argv[3]; W,H=540,960
b=subprocess.run(['ffmpeg','-v','error','-ss',str(t),'-i',v,'-frames:v','12','-vf',f'scale={W}:{H}','-pix_fmt','gray','-f','rawvideo','-'],stdout=subprocess.PIPE).stdout
f=np.frombuffer(b,np.uint8).astype(np.int16).reshape(-1,H,W)
acc=np.zeros((H,W),np.uint8)
for i in range(1,len(f)-1):
    a,c,d=f[i-1],f[i],f[i+1]
    acc|=((np.abs(c-a)>22)&(np.abs(c-d)>22)&(np.abs(d-a)<8)).astype(np.uint8)
img=np.stack([f[5].astype(np.uint8)]*3,-1); img[acc>0]=[255,0,0]
Image.fromarray(img).save(out)
