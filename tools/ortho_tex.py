import numpy as np
from PIL import Image, ImageFilter, ImageEnhance
from scipy.ndimage import map_coordinates
src=np.asarray(Image.open('ortho.jpg')).astype(np.float32)/255; S=src.shape[0]; px=400/S
UA,UB,VA,VB=-14.0,152.0,-64.0,46.0; res=0.0625
W=int(round((UB-UA)/res)); H=int(round((VB-VA)/res))
th=np.radians(18)
uu=UA+(np.arange(W)+0.5)*res; vv=VB-(np.arange(H)+0.5)*res
U,V=np.meshgrid(uu,vv)
x=U*np.cos(th)-V*np.sin(th); y=U*np.sin(th)+V*np.cos(th)
col=(x+200)/px-0.5; row=(200-y)/px-0.5
out=np.stack([map_coordinates(src[...,k],[row,col],order=3,mode='nearest') for k in range(3)],-1).clip(0,1)
# dehaze / levels: per-channel stretch on robust percentiles, shared so neutrals stay neutral
lo=np.percentile(out,0.3,axis=(0,1))*0.85; hi=np.minimum(1,np.percentile(out,99.8,axis=(0,1))*1.02)
lo_s=lo.mean()*0.6+lo*0.4; hi_s=hi.mean()*0.5+hi*0.5   # mostly shared, slight white balance
out=((out-lo_s)/(hi_s-lo_s)).clip(0,1)
out=out**1.0
im=Image.fromarray((out*255+0.5).astype(np.uint8))
im=ImageEnhance.Color(im).enhance(1.03)
im=ImageEnhance.Contrast(im).enhance(1.0)
# two-scale sharpening: fine detail then local contrast
im=im.filter(ImageFilter.UnsharpMask(radius=1.4,percent=55,threshold=3))
im=im.filter(ImageFilter.UnsharpMask(radius=10,percent=10,threshold=0))
im.save('/home/claude/site-viewer/data/ortho.jpg',quality=90,optimize=True,progressive=True,subsampling=0)
print(W,H)
c=im.crop((80*16//1-0,0,0,0)) if False else None
# preview crop near the porch for checking: u 0..30, v -20..10
x0=int((0-UA)/res); y0=int((VB-10)/res)
im.crop((x0,y0,x0+480,y0+480)).save('tex_check.png')
Image.fromarray((src[(S//2-300):(S//2+180), (S//2-100):(S//2+380)]*255).astype(np.uint8)).save('tex_before.png')
