"""Render a reusable linear equirectangular data map for the procedural world shader.
R holds optical cloud coverage, G cloud relief, B starlight. All albedo and
day/night changes remain editable directly in Blender's World node tree."""
from pathlib import Path
import numpy as np
from scipy.ndimage import map_coordinates
from PIL import Image
W,H=2048,1024
rng=np.random.default_rng(741)
def field(x,y,seed):
 tab=np.random.default_rng(seed).uniform(0,1,(256,256)).astype('f')
 return map_coordinates(tab,[y%256,x%256],order=3,mode='grid-wrap',prefilter=True)
phi=(np.arange(W,dtype='f')+.5)/W*2*np.pi-np.pi
elev=(.5-(np.arange(H,dtype='f')+.5)/H)*np.pi
sp,cp=np.sin(phi)[None,:],np.cos(phi)[None,:]
z=np.broadcast_to(np.sin(elev)[:,None],(H,W)); xx=np.cos(elev)[:,None]*cp; yy=np.cos(elev)[:,None]*sp
px=xx/(np.maximum(z,0)+.158)*3.05;py=yy/(np.maximum(z,0)+.158)*3.05
def smooth(lo,hi,v):
 a=np.clip((v-lo)/(hi-lo),0.,1.)
 return a*a*(3-2*a)
def density(x,y):
 a=x+(field(x*.93,y*.93,562)-.50)*.51
 b=y+(field(x*.93+57,y*.93,653)-.50)*.51
 return .61*field(a*.54+56,b*.54+39,130)+.218*field(a*1.70+33,b*1.70,18)+.115*field(a*4.21,b*4.21+12,426)+.057*field(a*11.63,b*11.63,687)
d=density(px,py);slope=density(px+.117,py-.081)-d
base=smooth(.035,.126,z)*(1.-.73*smooth(.65,.96,z))
cover=smooth(.50,.626,d)*base
relief=np.clip(.57+2.7*slope+(d-.57)*.28+.18*z,0,1)
stars=np.zeros((H,W),dtype='f')
for k in range(1650):
 sy=np.arcsin(rng.uniform(.055,1.))
 cy=(.5-sy/np.pi)*H;cx=rng.uniform(0,W)
 rad=.26+rng.power(.46)*.39
 strength=.23+.72*rng.power(.46)
 fy=int(cy);fx=int(cx)
 for y in range(max(0,fy-3),min(H,fy+4)):
  for x in range(fx-3,fx+4):
   # Projection compresses longitude at the pole. A narrow star reads best
   # after texture filtering and the highlighted cores remain discrete.
   fall=np.exp(-((x+.5-cx)**2+(y+.5-cy)**2)/(2*rad*rad))
   stars[y,x%W]=max(stars[y,x%W],strength*fall)
a=np.clip(np.stack((cover,relief,stars),axis=-1)*255,0,255).astype('uint8')
Image.fromarray(a).save(Path(__file__).with_name('weather_sky_data.png'),compress_level=4)
