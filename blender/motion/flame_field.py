"""The seven gas currents of the source Calcifer, as a closed Blender surface."""
from functools import lru_cache

import numpy as np


# Height, center X, center Z, radius X, radius Z in the original Three local frame.
CURRENTS = (
    ((-.18,0,0,.36,.28),(0,-.02,0,.56,.40),(.22,-.03,.02,.68,.50),(.52,-.04,.01,.70,.53),(.80,-.04,-.015,.63,.48),(1.07,-.09,-.045,.52,.43),(1.29,-.12,-.07,.43,.38),(1.46,-.045,-.075,.33,.30),(1.63,.11,-.085,.21,.22),(1.79,.16,-.07,.12,.13),(1.94,.08,-.04,.008,.012)),
    ((.12,.20,-.06,.37,.31),(.55,.32,-.10,.40,.32),(.86,.37,-.14,.30,.26),(1.06,.42,-.17,.21,.19),(1.26,.53,-.14,.17,.13),(1.43,.58,-.12,.103,.105),(1.56,.56,-.105,.061,.070),(1.68,.46,-.09,.009,.014)),
    ((.13,-.22,-.01,.31,.31),(.49,-.38,-.01,.31,.29),(.77,-.44,.015,.24,.22),(.96,-.55,.02,.17,.17),(1.14,-.57,.02,.11,.13),(1.31,-.46,-.01,.009,.012)),
    ((.08,-.42,.015,.24,.25),(.27,-.55,.035,.30,.23),(.46,-.66,.04,.23,.19),(.62,-.74,.03,.145,.135),(.71,-.84,.02,.085,.085),(.82,-.87,.005,.009,.011)),
    ((.10,.37,.05,.28,.245),(.30,.51,.04,.25,.23),(.47,.67,.04,.17,.17),(.60,.79,.06,.115,.105),(.72,.81,.09,.055,.08),(.80,.77,.12,.009,.01)),
    ((.75,-.15,.085,.16,.20),(.98,-.30,.09,.20,.17),(1.17,-.38,.08,.16,.14),(1.35,-.43,.08,.145,.12),(1.51,-.51,.055,.083,.085),(1.64,-.48,.055,.040,.050),(1.74,-.39,.05,.009,.012)),
    ((.47,-.10,-.17,.33,.33),(.86,-.16,-.24,.30,.29),(1.14,-.30,-.26,.25,.25),(1.40,-.36,-.28,.15,.16),(1.53,-.44,-.22,.07,.075),(1.62,-.39,-.20,.008,.012)),
)


def profiles(rows, heights):
    curve = np.asarray(rows, dtype=float)
    i = np.clip(np.searchsorted(curve[:, 0], heights) - 1, 0, len(curve) - 2)
    a, b = curve[i], curve[i + 1]
    prev, nxt = curve[np.maximum(i - 1, 0)], curve[np.minimum(i + 2, len(curve) - 1)]
    step = (b[:, 0] - a[:, 0])[:, None]
    t = ((heights - a[:, 0])[:, None] / step).clip(0, 1)
    t2, t3 = t*t, t*t*t
    result = (2*t3 - 3*t2 + 1) * a[:, 1:] + (3*t2 - 2*t3) * b[:, 1:]
    result += (t3-2*t2+t)*step*(b[:,1:]-prev[:,1:])/(b[:,0]-prev[:,0])[:,None]
    result += (t3-t2)*step*(nxt[:,1:]-a[:,1:])/(nxt[:,0]-a[:,0])[:,None]
    return result, (heights >= curve[0,0]) & (heights <= curve[-1,0])


@lru_cache(maxsize=1)
def gas_surface():
    """Surface nets on the blended gas field, with quads sharing a smooth boundary."""
    limits = ((-1.02,.99),(-.20,2.0),(-.69,.65))
    axes = [np.linspace(a,b,round((b-a)/.033)+1) for a,b in limits]
    x, y, z = np.meshgrid(*axes, indexing='ij', sparse=True)
    field = np.full(tuple(map(len,axes)), -.55)
    for curve in CURRENTS:
        data, valid = profiles(curve, axes[1])
        cx, cz, rx, rz = [c[None,:,None] for c in data.T]
        incoming = (1 - np.hypot((x-cx)/rx, (z-cz)/rz))*np.minimum(rx,rz)
        incoming = np.where(valid[None,:,None], incoming, -.55)
        blend = np.maximum(.105 - np.abs(incoming-field), 0)/.105
        field = np.maximum(field, incoming) + .02625*blend**2
    # A live flame meets the soot bed with a rounded lower edge.
    floor = (y+.126)*1.07
    k = np.maximum(.16-np.abs(field-floor),0)/.16
    field = np.minimum(field,floor)-.04*k*k
    corner = np.array([(i,j,k) for i in range(2) for j in range(2) for k in range(2)])
    size = np.array(field.shape)-1
    samples = np.array([field[tuple(slice(int(v),int(v+w)) for v,w in zip(c,size))] for c in corner])
    active = (samples.min(axis=0)<0)&(samples.max(axis=0)>=0)
    locations = np.array(np.where(active)).T
    values = samples[:,active]
    crossings = np.zeros((len(locations),3))
    counts = np.zeros((len(locations),1))
    for a in range(8):
        for b in range(a+1,8):
            if abs(corner[a]-corner[b]).sum()!=1:
                continue
            hit = (values[a]<0)!=(values[b]<0)
            t = values[a,hit]/(values[a,hit]-values[b,hit])
            crossings[hit] += corner[a] + t[:,None]*(corner[b]-corner[a])
            counts[hit] += 1
    delta = np.array([a[1]-a[0] for a in axes])
    vertices = np.array([a[0] for a in axes]) + (locations+crossings/counts)*delta
    lookup = np.full(size, -1, dtype=int)
    lookup[active] = np.arange(len(vertices))
    faces=[]
    for axis in range(3):
        direction = np.eye(3,dtype=int)[axis]
        first = field[tuple(slice(0, int(n-d)) for n,d in zip(field.shape,direction))]
        last = field[tuple(slice(int(d),int(n)) for n,d in zip(field.shape,direction))]
        indices = np.array(np.where((first<0)!=(last<0))).T
        u, v = np.roll(direction,1), np.roll(direction,2)
        for p in (indices,):
            cols = [lookup[tuple((p-q).T)] for q in (u+v,v,np.zeros(3,dtype=int),u)]
            quads = np.array(cols).T.copy()
            flip = first[tuple(p.T)] < 0
            quads[flip] = quads[flip,::-1]
            faces.extend(quads.tolist())
    return vertices.astype(np.float32), faces


def gas_waves(vertices):
    """Traveling height-weighted bends. Its foot stays at its contact with the wood."""
    x,y,z=vertices.T
    h=((y+.05)/1.96).clip(0,1)
    amp=(h**1.90)*(.84+.16*np.cos(4.0*x-2*z))
    for name,phase,xyz in (
        ("Buoyant roll · sine",0,(.119*np.cos(4.5*h+.9*x),.065*np.sin(4.9*h),.072*np.sin(5.4*h-.4*x))),
        ("Buoyant roll · cosine",1.5708,(.119*np.sin(4.5*h+.9*x),-.065*np.cos(4.9*h),-.072*np.cos(5.4*h-.4*x))),
        ("Flame curl · sine",0,(.074*np.cos(8*h+2.6*x),.046*np.cos(5.8*h+3.0*x),.045*np.sin(6.5*h+2*x))),
        ("Flame curl · cosine",1.5708,(.074*np.sin(8*h+2.6*x),.046*np.sin(5.8*h+3.0*x),-.045*np.cos(6.5*h+2*x))),
        ("Crossdraft",0,(.185*h,.025*np.sin(4.5*x),-.056*h)),
    ):
        offsets=np.column_stack(xyz)*amp[:,None]
        yield name,vertices+offsets,phase
