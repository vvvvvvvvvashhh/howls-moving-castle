import * as THREE from "../vendor/three.module.js";

const TAU = Math.PI * 2;
const smooth = (a, b, v) => THREE.MathUtils.smoothstep(v, a, b);
const mix = THREE.MathUtils.lerp;
const graphite = new THREE.Color();
const shade = (hex, gain = 1) => graphite.setHex(hex).clone().multiplyScalar(gain);

// All feather parts are indexed into a few materials. The spanwise joints then
// deform the coverts, skin and flight feathers together without opening seams.
class Surface {
  constructor() {
    this.p = [];
    this.c = [];
    this.i = [];
  }
  vertex(x, y, z, color) {
    const n = this.p.length / 3;
    this.p.push(x, y, z);
    this.c.push(color.r, color.g, color.b);
    return n;
  }
  quad(a, b, c, d, reverse = false) {
    if (reverse) this.i.push(a, c, b, b, c, d);
    else this.i.push(a, b, c, b, d, c);
  }
  geometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    geometry.setIndex(this.i);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

// The closed section has a slightly keeled rachis, an asymmetric leading vane
// and a cupped trailing vane. At the end the shaft and both vanes taper together.
function feather(buf, from, to, width, tint, options = {}) {
  const leading = options.leading ?? 0.41;
  const arch = options.arch ?? 0.019;
  const bend = options.bend ?? 0;
  const depth = options.depth ?? 0.011;
  const shape = options.shape ?? 0.66;
  const tilt = options.tilt ?? -0.10;
  const shaft = options.shaft ?? 0.12;
  const cup = options.cup ?? 0.10;
  const span = options.rows ?? 11;
  const solid = options.solid ?? true;
  const uv = solid ? [-1,-.52,-.12,-.036,0,.036,.12,.52,1] : [-1,-.50,-.07,0,.07,.50,1];
  const dx = to[0] - from[0], dz = to[2] - from[2];
  const len = Math.hypot(dx, dz) || 1;
  const px = -dz / len, pz = dx / len;
  const layer = [];
  for (let side = 0; side < (solid ? 2 : 1); side++) {
    const grid = [];
    for (let i = 0; i <= span; i++) {
      const v = i / span;
      const t = .5 - .5 * Math.cos(Math.PI * v), arc = Math.sin(Math.PI * t);
      const widthAt = Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(t, 0.92))), shape)
        * (0.70 + 0.48 * t);
      const w = width * Math.max(0.010, widthAt);
      const centerX = mix(from[0], to[0], t) + px * bend * arc;
      const centerY = mix(from[1], to[1], t) + arch * arc;
      const centerZ = mix(from[2], to[2], t) + pz * bend * arc;
      const row = [];
      for (const u of uv) {
        const a = Math.abs(u);
        const offset = u * w * (u < 0 ? leading : 1 - leading);
        const ridge = (1 - a) * depth * (0.5 + 0.5 * arc);
        const blade = centerY + offset * tilt - (a * a) * w * cup;
        const y = side === 0 ? blade + ridge : blade - ridge * 0.38 - 0.0011;
        const vane = u < 0 ? 0.94 : 1.02;
        const edge = 1 - 0.19 * Math.pow(a, 2.0);
        const keel = (1 - smooth(0.00, 0.075, a)) * shaft * (1 - t * .60);
        const gain = (0.87 + 0.18 * t) * vane * edge + keel;
        const color = tint.clone().multiplyScalar(gain * (side ? 0.64 : 1.0));
        row.push(buf.vertex(centerX + px * offset, y, centerZ + pz * offset, color));
      }
      grid.push(row);
    }
    layer.push(grid);
    for (let i = 0; i < span; i++) {
      for (let j = 0; j < uv.length - 1; j++) {
        buf.quad(grid[i][j], grid[i][j + 1], grid[i + 1][j], grid[i + 1][j + 1], !!side);
      }
    }
  }
  if (!solid) return;
  for (let i = 0; i < span; i++) {
    for (const e of [0, uv.length - 1]) {
      buf.quad(layer[0][i][e], layer[0][i + 1][e], layer[1][i][e], layer[1][i + 1][e], e === 0);
    }
  }
}

function wingBase(buf) {
  // Each section contains the leading edge, trailing edge, camber and thickness.
  const cuts = [
    [.065, -.168, .245, .032, .080], [.18, -.182, .320, .046, .092],
    [.34, -.168, .350, .053, .081], [.51, -.151, .364, .058, .066],
    [.65, -.190, .356, .059, .056], [.80, -.230, .327, .061, .048],
    [.93, -.246, .283, .060, .040], [1.05, -.229, .226, .053, .032],
    [1.17, -.192, .153, .043, .022], [1.28, -.128, .105, .032, .015],
    [1.37, -.070, .053, .021, .008], [1.42, -.024, .018, .012, .003]
  ];
  const both = [];
  for (let side = 0; side < 2; side++) {
    const rows = [];
    for (const [x, leading, trailing, y, thickness] of cuts) {
      const v = [];
      for (let j = 0; j <= 9; j++) {
        const u = j / 9;
        const round = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.73)), 0.72);
        const z = mix(leading, trailing, u);
        const h = y - .031*u - .054*smooth(.17,.74,u)
          + round*thickness*(side ? -.36 : .56);
        const col = shade(side ? 0x28313c : 0x2d3b45, (1 - .20 * u) * (.91 + .09 * round));
        v.push(buf.vertex(x, h, z, col));
      }
      rows.push(v);
    }
    both.push(rows);
    for (let i = 0; i < cuts.length - 1; i++)
      for (let j = 0; j < 9; j++)
        buf.quad(rows[i][j], rows[i][j + 1], rows[i + 1][j], rows[i + 1][j + 1], !!side);
  }
  for (let j of [0, 9]) {
    for (let i = 0; i < cuts.length - 1; i++)
      buf.quad(both[0][i][j], both[0][i + 1][j], both[1][i][j], both[1][i + 1][j], j === 0);
  }
}

function wingGeometry() {
  const buf = new Surface();
  const primaryInk = [0x273541, 0x2c3945, 0x2a3841, 0x27343e, 0x2b3948, 0x2b3840];
  // Manus to tip: the five outer primaries create the separated 'fingers'
  // of a crow. The shorter inner primaries grade into the secondary fan.
  const tips = [
    [1.445,-.122], [1.566,-.070], [1.650,.031], [1.655,.147], [1.584,.254],
    [1.475,.337], [1.344,.393], [1.232,.425], [1.127,.437], [1.038,.436],
  ];
  for (let i = tips.length - 1; i >= 0; i--) {
    const v = i / (tips.length - 1);
    const from = [1.087 - .243 * v, .051 + .004 * (1 - v), -.209 + .153 * v];
    const [tx, tz] = tips[i];
    feather(buf, from, [tx, .003 + .012 * Math.cos(i * .65), tz], mix(.100, .142, v),
      shade(primaryInk[i % primaryInk.length]), {
        leading: .34 + .10 * v, shape: .65 - .16 * v, bend: -.025 + .012 * v,
        arch: .018, tilt: -.12, cup: .085, shaft: .17, depth: .008
      });
  }
  for (let i = 0; i < 12; i++) {
    const s = i / 11, ax = .122 + .704 * s;
    const rootZ = .029 - .083 * s + .023 * Math.sin(s * Math.PI);
    const x = ax + .060 + .135 * s;
    const z = .332 + .108 * Math.sin(s * 1.54) + .011 * Math.sin(i * .6);
    feather(buf, [ax, .061 + .009 * Math.sin(s * Math.PI), rootZ],
      [x, .006 + .005 * Math.sin(i), z], .151 - .018 * s,
      shade([0x2e3b44, 0x303c45, 0x293741, 0x2d3e47][i % 4]), {
        shape: .34, leading: .46, arch: .006, bend: -.014, tilt: -.13, shaft: .085
      });
  }
  wingBase(buf);
  // Greater, median and lesser coverts break up the wide armwing, with short
  // rounded tips over the long flight feathers. The manus also carries an alula.
  const ranks = [
    { count:16, x0:.12, x1:1.16, root:-.108, end:.264, h:.091, width:.142, shade:[0x354650,0x32414c,0x34434d] },
    { count:15, x0:.12, x1:1.13, root:-.158, end:.160, h:.104, width:.134, shade:[0x354750,0x364651,0x374852] },
    { count:12, x0:.14, x1:1.04, root:-.176, end:.059, h:.109, width:.132, shade:[0x35454e,0x384851,0x354650] }
  ];
  for (const [ri, rank] of ranks.entries()) {
    for (let i = 0; i < rank.count; i++) {
      const u = i / (rank.count - 1);
      const ax = mix(rank.x0,rank.x1,u);
      const sweep = .017 * Math.sin(2 * Math.PI*u) - .045 * u;
      const az = rank.root + sweep;
      const tx = ax + .057 + .12*u;
      const tz = rank.end + .030 * Math.sin(Math.PI*u) - .118 * Math.pow(u, 2) + sweep;
      const h = rank.h - .033 * Math.pow(u, 1.9);
      feather(buf, [ax,h,az], [tx,h - .031 - .011 * (1-u),tz], rank.width,
        shade(rank.shade[(i+ri)%rank.shade.length], .90 + .015 * Math.sin(i*2.4)), {
          depth:.0042, arch:.006, shape:.41, tilt:-.12, cup:.065,
          leading:.45, shaft:.045, bend:-.008, rows:7, solid:false
        });
    }
  }
  for (let i = 0; i < 3; i++) {
    feather(buf, [.82 + .023*i,.090,-.198 + .020*i], [1.13+.027*i,.071,-.109 + .041*i],
      .079, shade([0x354751,0x33434e,0x31414d][i]), {
        depth:.005, shape:.65, tilt:-.12, rows:8, shaft:.10, solid:false
      });
  }
  const geo = buf.geometry();
  const idx = [], wt = [];
  const inf = [[.30,.66],[.68,1.01],[1.04,1.25]];
  for (let i = 0; i < buf.p.length; i += 3) {
    const x = buf.p[i];
    const a = smooth(inf[0][0], inf[0][1], x);
    const b = smooth(inf[1][0], inf[1][1], x);
    const c = smooth(inf[2][0], inf[2][1], x);
    idx.push(0,1,2,3);
    wt.push(1-a,a-b,b-c,c);
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx,4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wt,4));
  return geo;
}

function ellipses(buf, rings, topColor, underColor, steps = 32) {
  const rows = [];
  for (const [z, cy, rx, ry] of rings) {
    const row = [];
    for (let i = 0; i < steps; i++) {
      const r = i * TAU / steps, sn = Math.sin(r), cs = Math.cos(r);
      const col = shade(underColor).lerp(shade(topColor), .17 + .75*(sn*.5+.5));
      row.push(buf.vertex(rx*cs, cy + ry*sn, z, col));
    }
    rows.push(row);
  }
  for (let i=0;i<rows.length-1;i++)
    for (let j=0;j<steps;j++) {
      const k=(j+1)%steps;
      buf.quad(rows[i][j],rows[i][k],rows[i+1][j],rows[i+1][k]);
    }
}

function mesh(buf, mat, name) {
  const m = new THREE.Mesh(buf.geometry(), mat);
  m.name = name; m.castShadow = true;
  return m;
}

function defineWing(geo, mat, side) {
  const wing = new THREE.SkinnedMesh(geo, mat);
  wing.name = side > 0 ? 'Right wing' : 'Left wing';
  wing.castShadow = true; wing.frustumCulled = false;
  const joints = [];
  const origins = [[.095,.037,-.080],[.507,.050,.005],[.857,.063,-.166],[1.111,.056,-.170]];
  const previous = new THREE.Vector3();
  for (let i=0;i<origins.length;i++) {
    const point = new THREE.Vector3(...origins[i]);
    const bone = new THREE.Bone();
    bone.name = ['Shoulder','Elbow','Wrist','Manus'][i];
    bone.position.copy(point).sub(previous);
    (joints[i-1] || wing).add(bone);
    joints.push(bone); previous.copy(point);
  }
  wing.bind(new THREE.Skeleton(joints));
  const mirror = new THREE.Group();
  mirror.scale.x = side;
  mirror.add(wing);
  return { mirror, joints };
}

function addOval(parent, geometry, material, name, pos, size, rot) {
  const item = new THREE.Mesh(geometry, material);
  item.name = name; item.position.set(...pos); item.scale.set(...size);
  if (rot) item.rotation.set(...rot);
  parent.add(item);
  return item;
}

// A single flexible loft carries the crown into the nape, chest and rump.
// The bill and the eyes ride the same neck bone as the front of this surface.
const profile = [
  [-.511,.051,.039,.035],[-.493,.060,.076,.062],[-.466,.069,.103,.085],
  [-.429,.070,.124,.106],[-.382,.066,.136,.119],[-.332,.056,.140,.126],
  [-.277,.046,.143,.125],[-.224,.034,.150,.127],[-.161,.022,.166,.136],
  [-.077,.011,.180,.143],[.017,.008,.182,.140],[.099,.007,.166,.124],
  [.176,.012,.146,.104],[.245,.019,.113,.080],[.301,.021,.081,.059],
  [.358,.014,.040,.032],[.377,.010,.012,.015]
];

function surfacePoint(z, angle, lift, rings) {
  let j=1;
  while(j<rings.length-1 && rings[j][0]<z) j++;
  const a=rings[j-1],b=rings[j],q=THREE.MathUtils.clamp((z-a[0])/(b[0]-a[0]),0,1);
  return [Math.cos(angle)*(mix(a[2],b[2],q)+lift),
    mix(a[1],b[1],q)+Math.sin(angle)*(mix(a[3],b[3],q)+lift),z];
}

function bodyCoverts(buf) {
  const belts=[[-.501,-.409,16],[-.463,-.330,20],[-.398,-.246,22],
    [-.314,-.125,22],[-.201,.016,24],[-.095,.135,24],[.012,.234,23],[.122,.328,20]];
  // The short contour feathers lie tangent to the skin. Their looser tips at
  // the throat and pinky-width ridges on the back catch grazing light.
  for(let k=belts.length-1;k>=0;k--) {
    const [za,zb,count]=belts[k];
    for(let j=0;j<count;j++) {
      const angle=TAU*((j+(.33*(k%3)))/count);
      const grain=Math.sin(j*2.417+k*.67);
      const z0=za+.016*grain,z1=zb+.014*Math.sin(j*1.92+k);
      const breadth=(Math.PI/count)*1.02;
      const core=shade(0x26313b).lerp(shade(0x354650),.18+.70*(Math.sin(angle)*.5+.5));
      core.multiplyScalar(.88+.060*Math.sin(j*1.68+k*2.34));
      const rows=[];
      for(let it=0;it<=7;it++) {
        const t=it/7,z=mix(z0,z1,t);
        const w=Math.pow(Math.max(0,Math.sin(t*Math.PI)),.48)*breadth+.0001;
        const mid=angle+grain*.039*t;
        const row=[];
        for(const u of [-1,-.51,-.06,0,.06,.51,1]) {
          const relief=.00085+.0022*(1-Math.abs(u))*Math.sin(Math.PI*t)+.0012*t;
          const v=surfacePoint(z,mid+u*w,relief,profile);
          const c=core.clone().multiplyScalar(1-.055*Math.abs(u)+.03*t+(u === 0 ? .026 : 0));
          row.push(buf.vertex(v[0],v[1],v[2],c));
        }
        rows.push(row);
      }
      for(let t=0;t<7;t++) for(let u=0;u<6;u++)
        buf.quad(rows[t][u],rows[t][u+1],rows[t+1][u],rows[t+1][u+1]);
    }
  }
}

function billAssembly() {
  const head=new THREE.Group();head.name='Bill and eyes';
  const bill=new Surface();
  // z, width, gape line, upper profile and lower profile. The mandibles meet
  // along a narrow seam; a crow's upper culmen is only gently downcurved.
  const sections=[
    [-.403,.002,.019,.022,.017],[-.393,.010,.022,.033,.016],
    [-.371,.020,.026,.046,.013],[-.343,.028,.029,.059,.010],
    [-.306,.039,.031,.073,.007],[-.259,.054,.033,.088,.002],
    [-.215,.069,.034,.093,-.002],[-.178,.077,.034,.092,-.003]
  ];
  const rows=[];
  const steps=32;
  for(const [z,w,g,top,base] of sections) {
    const row=[];
    for(let i=0;i<steps;i++) {
      const a=TAU*i/steps, sn=Math.sin(a), cs=Math.cos(a);
      const y=g+(sn>=0?(top-g)*Math.pow(sn,.91):(g-base)*Math.sign(sn)*Math.pow(-sn,.84));
      const color=sn>.001?shade(0x303b45,.88+.16*sn):shade(0x232d36,.85+.14*(-sn));
      row.push(bill.vertex(w*cs,y,z,color));
    }
    rows.push(row);
  }
  for(let j=0;j<rows.length-1;j++) for(let i=0;i<steps;i++)
    bill.quad(rows[j][i],rows[j][(i+1)%steps],rows[j+1][i],rows[j+1][(i+1)%steps]);
  for(const s of [-1,1]) {
    const slit=[];
    for(let i=0;i<sections.length;i++){
      const [z,w,y]=sections[i],h=.00030+.00155*Math.sin(Math.PI*i/(sections.length-1));
      slit.push([bill.vertex(s*(w+.00035),y-h,z,shade(0x131b23)),
        bill.vertex(s*(w+.00035),y+h,z,shade(0x131b23))]);
    }
    for(let i=0;i<slit.length-1;i++)
      bill.quad(slit[i][0],slit[i][1],slit[i+1][0],slit[i+1][1],s<0);
  }
  // A few short rictal feathers overlap the base of the bill.
  for(const s of [-1,1]) {
    for(let j=0;j<7;j++) {
      const theta=.20+.163*j;
      const dz=.034*Math.sin(.8*j);
      feather(bill,[s*.084*Math.cos(theta),.034+.075*Math.sin(theta),-.186],
        [s*.047*Math.cos(theta),.035+.057*Math.sin(theta),-.265+dz],
        .008+.002*Math.cos(j),shade(0x293640), {
          leading:.49,depth:.001,shape:.86,arch:.004,cup:0,shaft:.03,rows:5,solid:false
        });
    }
  }
  const beak=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.54,metalness:.05,side:THREE.DoubleSide});
  head.add(mesh(bill,beak,'Upper and lower mandibles'));
  const orb=new THREE.SphereGeometry(1,14,10);
  const iris=new THREE.MeshStandardMaterial({color:0x241f20,roughness:.48});
  const eye=new THREE.MeshStandardMaterial({color:0x080a0e,roughness:.21,metalness:.08});
  const glint=new THREE.MeshBasicMaterial({color:0xaaaeb0});
  const nostril=new THREE.MeshStandardMaterial({color:0x131b21,roughness:.76});
  for(const s of [-1,1]) {
    addOval(head,orb,iris,'Iris',[s*.1120,.087,-.160],[.0048,.0136,.0164]);
    addOval(head,orb,eye,'Cornea',[s*.1151,.0873,-.1609],[.0048,.0109,.0131]);
    addOval(head,orb,glint,'Catchlight',[s*.1194,.0911,-.1645],[.0016,.0023,.0023]);
    addOval(head,orb,nostril,'Nostril',[s*.045,.063,-.258],[.0028,.0031,.011],[.21,0,s*.59]);
  }
  return head;
}

function trunkAssembly() {
  const body = new Surface();
  ellipses(body,profile,0x303e47,0x202a33,40);
  bodyCoverts(body);
  for (const s of [-1,1]) {
    for (let i=0;i<6;i++) {
      const u=i/5;
      feather(body,[s*(.050+.070*u),.145-.023*u,-.198+.015*u],
        [s*(.104+.11*u),.070-.010*u,.234-.087*u],.094,
        shade([0x35434c,0x34454c,0x33434c][i%3]), {
          depth:.005,arch:.014,shape:.38,leading:.48,shaft:.042,rows:8,tilt:-.05*s,solid:false
        });
    }
  }
  const geo=body.geometry(), idx=[], wt=[];
  for(let i=2;i<body.p.length;i+=3) {
    const fraction=1-smooth(-.362,-.161,body.p[i]);
    idx.push(0,1,0,0);wt.push(1-fraction,fraction,0,0);
  }
  geo.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(idx,4));
  geo.setAttribute('skinWeight',new THREE.Float32BufferAttribute(wt,4));
  const plumage=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.83,metalness:.015,side:THREE.DoubleSide});
  const trunk=new THREE.SkinnedMesh(geo,plumage);
  trunk.name='Crown, neck, mantle, breast and rump';trunk.castShadow=true;trunk.frustumCulled=false;
  const base=new THREE.Bone(),neck=new THREE.Bone();
  neck.name='Neck';neck.position.set(0,.020,-.280);
  base.add(neck);trunk.add(base);trunk.bind(new THREE.Skeleton([base,neck]));
  neck.add(billAssembly());
  return {trunk,head:neck};
}

function tailAssembly(mat) {
  const tail = new THREE.Group(); tail.name='Tail fan'; tail.position.set(0,.017,.208);
  const each = [];
  for (const side of [-1,1]) {
    const half = new Surface();
    for (let i=5;i>=0;i--) {
      const s=(i+.5)/6;
      const toZ=.426-.054*Math.pow(s,1.85);
      feather(half, [side*(.010+.044*s),.007+.003*(1-s),-.040+.019*s],
        [side*(-.012+.172*s),-.034-.014*s,toZ],.113-.010*s,
        shade([0x2a3944,0x303c47,0x293741,0x2d3a43][i%4]),{
          shape:.35, leading:.49, depth:.005, arch:.022, cup:.065,
          shaft:.12, tilt:-side*.065, bend:side*.009
        });
    }
    const m=mesh(half,mat,'Rectrices');
    tail.add(m); each.push(m);
  }
  return {tail,each};
}

function tuckedFeet(parent) {
  const geometry = new THREE.SphereGeometry(1,10,7);
  const foot = new THREE.MeshStandardMaterial({color:0x28303a,roughness:.71});
  for (const s of [-1,1]) {
    addOval(parent,geometry,foot,'Tucked tarsus',[s*.080,-.061,.182],[.016,.023,.092],[-.18,s*.11,0]);
    // Three toes stay tucked close to the belly, as in normal cruising flight.
    for (let i=0;i<3;i++) {
      addOval(parent,geometry,foot,'Tucked toe',[s*(.061+i*.017),-.072,.243+i*.003],
        [.0055,.006,.036],[-.20,s*(-.13+.15*i),0]);
    }
  }
}

function createCrow() {
  const group = new THREE.Group(); group.name='Black crow';
  const flight = new THREE.Group(); group.add(flight);
  const mat = new THREE.MeshStandardMaterial({
    vertexColors:true, roughness:.66, metalness:.045, side:THREE.DoubleSide
  });
  const wingGeo=wingGeometry(), wings=[defineWing(wingGeo,mat,-1),defineWing(wingGeo,mat,1)];
  for (const w of wings) flight.add(w.mirror);
  const {trunk,head}=trunkAssembly(); flight.add(trunk);
  const {tail,each}=tailAssembly(mat); flight.add(tail);
  tuckedFeet(flight);
  const windows=[[.25,2.48],[4.78,6.65],[8.45,10.64],[12.05,14.33],[16.38,17.94],
    [18.63,20.40],[21.72,23.50],[24.65,26.78],[28.02,29.40]];
  const controls={energy:1,glide:0,bank:0,look:0};
  function setFlight(options = {}) {
    for (const name of Object.keys(controls))
      if (Number.isFinite(options[name])) controls[name] = options[name];
  }
  function update(t) {
    let pumping=0;
    for(const [a,b] of windows)
      pumping = Math.max(pumping,smooth(a-.30,a+.23,t)*(1-smooth(b-.23,b+.30,t)));
    const strength=THREE.MathUtils.clamp((.012+.988*pumping)*controls.energy*(1-controls.glide),0,1.2);
    // A slightly non-sinusoidal downstroke gives a shorter push and an elastic
    // recovery. Elbow and wrist lag independently as the hand folds on the rise.
    const p=TAU*(2.03*t+.035*Math.sin(t*1.20))+.14;
    const wave=Math.sin(p+.14*Math.sin(p-.35));
    const recovering=.5+.5*Math.cos(p);
    for (let i=0;i<wings.length;i++) {
      const side=i ? 1 : -1, [shoulder,elbow,wrist,hand]=wings[i].joints;
      const offset=side*(.018*Math.sin(t*1.28)+controls.bank*.10);
      shoulder.rotation.set(
        -.11*strength*Math.cos(p)-.024,
        -.035-.040*strength*recovering,
        .102 + offset + strength*(.79*wave+.045)
      );
      elbow.rotation.set(
        .042*strength*wave,
        -.022-.19*strength*recovering,
        .055-.23*strength*Math.cos(p-.06)
      );
      wrist.rotation.set(
        -.050-.10*strength*Math.cos(p-.27),
        -.060-.30*strength*recovering,
        -.135+strength*(.255*Math.sin(p-1.19)-.07)
      );
      hand.rotation.set(.032-.085*strength*Math.cos(p-.25),-.020-.11*strength*recovering,
        -.047+.20*strength*Math.sin(p-1.43));
    }
    flight.position.y=-.018*strength*Math.sin(p-.47)+.006*Math.sin(t*1.2);
    flight.rotation.x=.016*Math.sin(t*.91)+.040*strength*Math.cos(p-.25);
    flight.rotation.z=.015*Math.sin(t*.81)+.01*strength*Math.sin(p-.28);
    head.rotation.x=-flight.rotation.x*.76+.019*Math.sin(t*1.61);
    head.rotation.y=.068*Math.sin(.87*t+.40)+.040*Math.sin(1.79*t)+controls.look;
    tail.rotation.x=.060+.089*strength*Math.cos(p-.75)+.026*Math.sin(t*1.25);
    tail.rotation.y=.045*Math.sin(.79*t)-.10*controls.bank;
    for(let i=0;i<each.length;i++)
      each[i].rotation.y=(i?1:-1)*(.012+.075*strength*recovering+.022*Math.sin(t*.96));
  }
  let drawCalls=0, triangles=0;
  group.traverse(o=>{
    if(o.isMesh) { drawCalls++; triangles+=(o.geometry.index?.count ?? o.geometry.attributes.position.count)/3; }
  });
  update(0);
  return {group, update, setFlight, stats:{drawCalls,triangles,primaryPerWing:10,secondaryPerWing:12,wingspan:3.31}};
}

export { createCrow };
