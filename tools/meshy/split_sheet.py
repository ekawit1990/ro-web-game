import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
P=np.fromfile('pos.f32',np.float32).reshape(-1,3); I=np.fromfile('idx.u32',np.uint32).reshape(-1,3).astype(np.int64)
q=np.round(P*1e5).astype(np.int64)
_,wid=np.unique(q,axis=0,return_inverse=True); wid=wid.ravel()
WI=wid[I]; n=wid.max()+1
e=np.concatenate([WI[:,[0,1]],WI[:,[1,2]]])
nc,lab=connected_components(coo_matrix((np.ones(len(e)),(e[:,0],e[:,1])),shape=(n,n)),directed=False)
tl=lab[WI[:,0]]; C=P[I].mean(1)
cnt=np.bincount(tl,minlength=nc)
cent=np.stack([np.bincount(tl,C[:,k],nc)/np.maximum(cnt,1) for k in range(3)],1)
hw=1.314;hh=hw*0.65;cx=-0.005;cy=0.0118
colpx=np.array([325,465,595,725,865,1000,1135,1265,1400,1535,1665]);rowpx=np.array([80,280,475,670,860,1040,1220])
colw=(colpx/1000-1)*hw+cx; roww=(1-rowpx/650)*hh+cy
ci=np.abs(cent[:,0,None]-colw[None]).argmin(1); ri=np.abs(cent[:,1,None]-roww[None]).argmin(1)
ca=ri*11+ci
ta=ca[tl].astype(np.int8)
# drop display bases: per monster, components that are flat (height small), at the bottom, wide
mn=np.full((nc,3),9.);mx=np.full((nc,3),-9.)
V=P[I].reshape(-1,3); tv=np.repeat(tl,3)
for k in range(3):
  np.minimum.at(mn[:,k],tv,V[:,k]); np.maximum.at(mx[:,k],tv,V[:,k])
drop=0
for m in range(77):
  cs=np.where(ca==m)[0]; cs=cs[cnt[cs]>0]
  if len(cs)==0: print('empty',m); continue
  lo=mn[cs,1].min(); hi=mx[cs,1].max(); H=hi-lo
  for c in cs:
    h=mx[c,1]-mn[c,1]; wdt=mx[c,0]-mn[c,0]
    if h<0.12*H and mn[c,1]<lo+0.08*H and wdt>0.35*H and cnt[c]>50:
      ta[tl==c]=-1; drop+=1; print('drop base m%d comp tris %d h %.3f w %.3f'%(m,cnt[c],h,wdt))
print('drops',drop,'tris per monster',np.bincount(ta[ta>=0],minlength=77))
open('tri_assign2.bin','wb').write(ta.tobytes())
