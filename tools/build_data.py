import numpy as np, json
from scipy.ndimage import median_filter, distance_transform_edt, maximum_filter, binary_closing, binary_opening
a=np.load('pts.npy'); th=np.radians(18); DATUM=159.0
x,y=a['x'].astype(np.float64),a['y'].astype(np.float64)
u=x*np.cos(th)+y*np.sin(th); v=-x*np.sin(th)+y*np.cos(th)
z=a['z']-DATUM; c=a['c']; I=a['i'].astype(np.float32)
# property crop (plan frame): Carlingview Dr sidewalk to the east yard, north fence to south tree line
UA,UB,VA,VB=-14.0,152.0,-64.0,46.0; res=0.25
Nu=int(round((UB-UA)/res))+1; Nv=int(round((VB-VA)/res))+1; N=Nu
inb=(u>=UA-1)&(u<=UB+1)&(v>=VA-1)&(v<=VB+1)
u,v,z,c,I=u[inb],v[inb],z[inb],c[inb],I[inb]
ix=np.clip(np.round((u-UA)/res).astype(int),0,Nu-1); iy=np.clip(np.round((v-VA)/res).astype(int),0,Nv-1)
lin=iy*Nu+ix
def agg(mask,fn,fill=np.nan):
    out=np.full(Nu*Nv,fill,np.float64); l=lin[mask]; zz=z[mask]
    if fn=='max': np.maximum.at(out,l,zz) if not np.isnan(fill) else None
    return out
# ground: mean of class2 per cell
g=c==2; cnt=np.bincount(lin[g],minlength=Nu*Nv); s=np.bincount(lin[g],weights=z[g],minlength=Nu*Nv)
gr=np.where(cnt>0,s/np.maximum(cnt,1),np.nan).reshape(Nv,Nu)
# fill holes nearest
m=np.isnan(gr); idx=distance_transform_edt(m,return_distances=False,return_indices=True); gr=gr[tuple(idx)]
gr=median_filter(gr,3)
# building/bridge top
b=(c==6)|(c==17); bt=np.full(Nu*Nv,-1e9); np.maximum.at(bt,lin[b],z[b]); bt=bt.reshape(Nv,Nu)
bm=bt>-1e8
bm=binary_closing(bm,iterations=1); bm=binary_opening(bm,iterations=1)
bt2=np.where(bt>-1e8,bt,np.nan)
m2=np.isnan(bt2); idx=distance_transform_edt(m2,return_distances=False,return_indices=True); bt2=bt2[tuple(idx)]
bt2=median_filter(bt2,3)
H=gr.copy()   # buildings are drawn as solids (solids.py); the terrain is bare ground
# intensity on ground for colour
gi=np.bincount(lin[g],weights=I[g],minlength=Nu*Nv); gi=np.where(cnt>0,gi/np.maximum(cnt,1),np.nan).reshape(Nv,Nu)
idx=distance_transform_edt(np.isnan(gi),return_distances=False,return_indices=True); gi=gi[tuple(idx)]
lo,hi=np.percentile(gi,[2,98]); gi=((gi-lo)/(hi-lo)).clip(0,1)
# porch carve-out: roof overhang over recessed porch (plan frame u,v metres)
U=(UA+np.arange(Nu)*res)[None,:]; V=(VA+np.arange(Nv)*res)[:,None]
carve=(U>=4.8)&(U<9.0)&(V>-16.3)&(V<0.4)
H=np.where(carve,gr,H); bm=bm&~carve
FT=0.3048
rects=[(-8.92,-3.92,-53.9,-15.2,1.875),(-8.92,-3.92,-60.66,-53.9,0),(-8.92,28,-66,-60.66,0),
 (0,6.19,-25.9,12.2,1.875),(-8.92,0,-25.9,-20.07,1.875),(-8.885,0,-20.07,0,1.875),(0,6.2,-25.4,29.1,1.875)]
for X0,X1,Y0,Y1,top in rects:
    m=(U>=6.6+X0*FT-0.25)&(U<=6.6+X1*FT+0.25)&(V>=-8.5+Y0*FT-0.25)&(V<=-8.5+Y1*FT+0.25)&~bm
    H=np.where(m,np.minimum(H,top*FT-0.03),H)
cls=np.where(bm,1,0).astype(np.uint8)
# bridge flag
bb=np.zeros(Nu*Nv,bool); bb[lin[c==17]]=True; cls[(bb.reshape(Nv,Nu))&bm]=2
base=-10.0
Hq=np.round((H-base)*100).clip(0,65535).astype(np.uint16)
Hq.tofile('/home/claude/site-viewer/data/terrain_h.bin')
col=np.where(cls>0,0,np.round(gi*250)).astype(np.uint8)
np.stack([col,cls],-1).astype(np.uint8).tofile('/home/claude/site-viewer/data/terrain_c.bin')
# vegetation points: class1 above ground >0.8
gx=np.clip(np.round((u-UA)/res).astype(int),0,Nu-1); gy=np.clip(np.round((v-VA)/res).astype(int),0,Nv-1)
hag=z-gr[gy,gx]
inbox=(u>=UA)&(u<=UB)&(v>=VA)&(v<=VB)
veg=inbox&(c==1)&(hag>0.8)&(~bm[gy,gx])&~((u>2.0)&(u<9.5)&(v>-18)&(v<3.5))
def vox(mask,vs):
    k=np.stack([np.floor(u[mask]/vs),np.floor(v[mask]/vs),np.floor(z[mask]/vs)],1).astype(np.int64)
    _,first=np.unique(k,axis=0,return_index=True); return np.flatnonzero(mask)[first]
vi=vox(veg,0.2)
def pack(ids,name):
    q=np.stack([np.round(u[ids]*100),np.round(v[ids]*100),np.round(z[ids]*100)],1).clip(-32768,32767).astype(np.int16)
    ii=(((I[ids]-lo)/(hi-lo)).clip(0,1)*255).astype(np.uint8); cc=c[ids].astype(np.uint8)
    hh=(np.clip(hag[ids],0,25)*10).astype(np.uint8)
    rec=np.zeros(len(ids),dtype=[('p','<i2',3),('i','u1'),('c','u1')]); rec['p']=q; rec['i']=ii; rec['c']=cc
    rec.tofile(f'/home/claude/site-viewer/data/{name}.bin'); return len(ids)
nveg=pack(vi,'veg')
# full classified cloud within 110 m, 0.3m voxel (keeps detail)
allm=inbox&(c!=7)&(c!=18)
near=allm&(u>-12)&(u<35)&(v>-45)&(v<15)
ai=np.concatenate([vox(allm&~near,0.2),np.flatnonzero(near)]); npts=pack(ai,'points')
meta=dict(Nu=Nu,Nv=Nv,u0=UA,v0=VA,res=res,base=base,datum_m=DATUM,rot_deg=18,
  origin_utm17=[613659,4836777],n_veg=int(nveg),n_points=int(npts),
  source="ON_TRCA2023_20230511 1km E6130 N48360 CLASS (COPC), NAD83(CSRS) UTM17N, CGVD2013 heights",
  units="metres, plan frame u=E18N, v=N18W; z above project datum 0'-0\" = 159.0 m")
json.dump(meta,open('/home/claude/site-viewer/data/meta.json','w'),indent=1)
print(meta)
