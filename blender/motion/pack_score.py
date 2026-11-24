"""Include a local, user-supplied score strip, leaving the 3D camera render available."""
from pathlib import Path

import bpy


def pack_score(scene,path=None):
    if path is None:
        raise ValueError('Provide a local audio path to pack_score; no score is included in this repository.')
    path=Path(path).expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(path)
    seq=scene.sequence_editor_create()
    strips=getattr(seq,'sequences',None)
    if strips is None: strips=seq.strips
    title='Local score • 60 seconds'
    sound_strip=strips.get(title)
    if sound_strip is None:
        sound_strip=strips.new_sound(title,str(path),channel=1,frame_start=scene.frame_start)
    snd=sound_strip.sound
    if not snd.packed_file:snd.pack()
    sound_strip.volume=1.0
    if hasattr(sound_strip,'pan'):sound_strip.pan=0
    scene.render.ffmpeg.audio_codec='AAC'
    # Blender 4.3 renders the camera if the sequencer contains sound only.
    # Enabling the sequencer also routes that strip to playback and movie audio.
    scene.render.use_sequencer=True
    scene.use_audio=True
    scene.use_audio_scrub=True
    return sound_strip
