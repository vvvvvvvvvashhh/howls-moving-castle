"""Increase selected hero geometry within the recovered Castle/Batch source."""
from pathlib import Path
from sys import argv

def refine(src):
    before, rest = src.split('// src/castle.js', 1)
    castle, after = rest.split('// src/landforms.js', 1)
    def replace(old, new):
        nonlocal castle
        assert castle.count(old) == 1, old
        castle = castle.replace(old, new)
    replace('const boxGeo = () =>', '''
// Rounded plate, beam and machine housing. A cuboid with a circular
// fillet of constant world-space width on all twelve edges.
function castBox(dim) {
 const half=dim.map(v=>v*.5), bevel=Math.min(.115,Math.min(...half)*.32);
 const axes=[[2,0,1,1],[2,0,1,-1],[0,1,2,1],[0,1,2,-1],[1,2,0,1],[1,2,0,-1]];
 const pos=[],normal=[],uv=[],indices=[];
 for(const [f,u,v,side] of axes){
  const base=pos.length/3;
  const us=[-half[u],-half[u]+bevel,half[u]-bevel,half[u]];
  const vs=[-half[v],-half[v]+bevel,half[v]-bevel,half[v]];
  for(const y of vs) for(const x of us) {
   const a=[0,0,0];a[f]=half[f]*side;a[u]=x;a[v]=y;
   const center=a.map((q,i)=>Math.max(-half[i]+bevel,Math.min(half[i]-bevel,q)));
   const n=a.map((q,i)=>q-center[i]);const len=Math.hypot(...n)||1;
   const unit=n.map(q=>q/len);pos.push(...center.map((q,i)=>q+unit[i]*bevel));normal.push(...unit);
   uv.push((x/half[u]+1)*.5,(y/half[v]+1)*.5);
  }
  for(let y=0;y<3;y++)for(let x=0;x<3;x++){
   const a=base+y*4+x,b=a+1,c=a+4,d=c+1;
   if(side>0)indices.push(a,b,c,b,d,c);else indices.push(a,c,b,b,c,d);
  }
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
 g.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
 g.setIndex(indices);return g;
}
const boxGeo = () =>''')
    replace("this.add(boxGeo(),col,kind,transform(pos,rot,sz));", """const dims=sz.slice().sort((a,b)=>a-b);
  if(dims[0]>.20 && dims[1]>.38 && dims[2]>.72 && (kind==='metal'||kind==='wood'||kind==='brass')){
   this.add(castBox(sz),col,kind,transform(pos,rot));return;
  }
  this.add(boxGeo(),col,kind,transform(pos,rot,sz));""")
    replace("this.add(orbGeo(h,k),col,kind,transform(pos,rot,sz));", """const broad=Math.max(...sz)>1.35 && Math.min(...sz)>.24;
  this.add(orbGeo(broad?Math.max(32,h):h,broad?Math.max(18,k):k),col,kind,transform(pos,rot,sz));""")
    replace("this.add(tubeGeo(r1,r2,n),c,kind,transform", """if(Math.max(r1,r2)>.38 && n>=10)n=Math.max(n,Math.max(r1,r2)>1.05?36:24);
  this.add(tubeGeo(r1,r2,n),c,kind,transform""")
    replace("this.add(torGeo(r,t,n),c,kind,transform", """if(r>.64 && n>=12)n=Math.max(n,r>1.4?44:32);
   this.add(torGeo(r,t,n),c,kind,transform""")
    replace("b.surf(4,2,pp,col,'metal',false,1.5,1);", """const gauge=.135,outer=th+.036;
   const dome=(s,t)=>pp(s,t,outer+.042*Math.sin(Math.PI*s)*Math.sin(Math.PI*t));
   b.surf(8,4,dome,col,'metal',false,1.5,1);
   const cut=mix(col,'#382f2a',.20),edge=(s,t,v)=>pp(s,t,outer-gauge*(1-v));
   b.surf(8,1,(s,v)=>edge(s,0,v),cut,'metal');
   b.surf(8,1,(s,v)=>edge(1-s,1,v),cut,'metal');
   b.surf(4,1,(t,v)=>edge(0,1-t,v),cut,'metal');
   b.surf(4,1,(t,v)=>edge(1,t,v),cut,'metal');""")
    replace("b.surf(4,3,pp,c,'metal',false,1.3,1.3,", """const rim=mix(c,'#3c3832',.19);
   b.surf(8,1,(u,s)=>pp(u,0,-.060+.093*s),rim,'metal');
   b.surf(8,1,(u,s)=>pp(1-u,1,-.060+.093*s),rim,'metal');
   b.surf(8,5,(u,t)=>pp(u,t,.033+.020*Math.sin(u*Math.PI)*Math.sin(t*Math.PI)),c,'metal',false,1.3,1.3,""")
    replace("b.surf(2,1,(u,t)=>{const P=at(lerp(us+.0009,ue-.0009,u),lerp(t0,t1,t),hi*(1-.72*t)+.037*Math.sin(Math.PI*u)**2);P.y-=.035*Math.sin(Math.PI*u)*(1-t);return P;},cs,'roof',sign>0);", """const tilePoint=(u,t)=>{const P=at(lerp(us+.0009,ue-.0009,u),lerp(t0,t1,t),hi*(1-.72*t)+.042*Math.sin(Math.PI*u)**2);P.y-=.035*Math.sin(Math.PI*u)*(1-t);return P;};
       b.surf(4,2,tilePoint,cs,'roof',sign>0);
       b.surf(4,1,(u,s)=>{const p=tilePoint(u,0);p.y-=.045*(1-s);return p;},mix(cs,'#542d28',.20),'roof',sign<0);""")
    return before+'// src/castle.js'+castle+'// src/landforms.js'+after

if __name__ == '__main__':
    src, out = map(Path, argv[1:])
    out.write_text(refine(src.read_text()))
