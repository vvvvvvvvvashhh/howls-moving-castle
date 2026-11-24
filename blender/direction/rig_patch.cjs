'use strict';

// The film provides one global "flight" slider. Retain its mesh, four
// two-link IK solvers, skin inverse binds and batten profiles. Only expand
// the controls that a unilateral takeoff and a world-fixed stance require.
// With no options.direction all original shots still use the original code.
function patchRigSource(html) {
  const substitute=(oldText,newText)=>{
    const i=html.indexOf(oldText);
    if(i<0 || html.indexOf(oldText,i+oldText.length)>=0)
      throw new Error('Unexpected or duplicate rig source: '+oldText.slice(0,90));
    html=html.slice(0,i)+newText+html.slice(i+oldText.length);
  };
  substitute('motion=sampleLocomotion(t,options);const pose=motion.body;', [
    'motion=sampleLocomotion(t,options);const pose=motion.body;',
    '  if(options.direction){',
    '   const cue=options.direction;motion.direction=cue;',
    '   const air=cue.airborne;',
    '   pose.pitch=pose.pitch*(1-air)+cue.pitch;pose.yaw=pose.yaw*(1-air)+cue.yaw;',
    '   pose.roll=pose.roll*(1-air)+cue.roll;pose.y+=cue.compressY;',
    '   for(let i=0;i<motion.feet.length;i++){',
    '    const f=motion.feet[i],shoe=cue.feet[i],b=shoe.brace;',
    '    f.travel+=(shoe.stanceTravel-f.travel)*b;f.lift*=1-b;f.pitch*=1-b;f.gather*=1-b;f.sideArc*=1-b;',
    '    f.tuck=shoe.tuck;f.planted=b>=1?shoe.planted:f.planted;f.direction=shoe;',
    '   }',
    '  }',
  ].join('\n'));
  substitute('airP.copy(airShoe).applyMatrix4(body.matrix);P.lerp(airP,tuck);', [
    'airP.copy(airShoe).applyMatrix4(body.matrix);',
    '  if(pose.direction){airP.x+=pose.direction.swingX;airP.y+=pose.direction.swingY;airP.z+=pose.direction.swingZ;}',
    '  P.lerp(airP,tuck);',
  ].join('\n'));
  substitute('const opening = smoothRange(.015, .78, state.flight);','/* Each sail has its own opening time. */');
  substitute('for (const { side, rig, bones } of sides) {',[
    'for (const { side, rig, bones } of sides) {',
    '      const cue=state.direction, which=side>0?1:0;',
    '      const wingFlight=cue?cue.wing[which]:state.flight;',
    '      const opening=smoothRange(.015,.78,wingFlight);',
  ].join('\n'));
  substitute('const catchAir = smoothRange(.085, .71, state.flight);','const catchAir = smoothRange(.085,.71,wingFlight);');
  substitute('if (state.flight === last.flight) continue;',[
    'if(cue){rig.rotation.z+=cue.wingFlex[which];rig.rotation.x+=cue.wingFlex[which]*.28;}',
    '      if (!cue && state.flight === last.flight) continue;',
  ].join('\n'));
  substitute('last.flight = state.flight;','last.flight = state.direction ? NaN : state.flight;');
  substitute('prop.rotation.z=side*(t*2.42+.31)+.52*side;',[
    'const angle=state.direction?state.direction.propellerPhase*(side>0?1.018:.982):t*2.42;',
    '    prop.rotation.z=side*(angle+.31)+.52*side;',
  ].join('\n'));
  return html;
}

module.exports={patchRigSource};
