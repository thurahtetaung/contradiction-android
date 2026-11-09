Version 0.10 adds audio-clock captions for the 28 original spoken phone recordings
(including the Mike call). C29 contains no speech. Timing data was generated
offline from the original MP3s with faster-whisper, then forced-aligned against
the original dialogue. Only timings and word indices are stored in source;
the app reads wording from the user's supplied game. No recognition runs on
Android. The captions advance on media events and remain available with CC off.
Full transcripts, with speaker lines, remain in the casebook.

Replay audio is owned by the transcript page. Both Back paths stop it, restore
music volume and remove it from the lifecycle resume list. Live calls retain
their original engine lifecycle.

The HTML-to-text adapter preserves BR and block boundaries in hints and reply
messages. A newly solved trap displays both original statements and an animated
gold confirmation for 3.4 seconds, before the original reaction at 4 seconds.
Animations are finite and honor reduced motion.

Regression coverage uses the original engine and temporary browser saves:
hint and interview spacing, valid deduction feedback, live audio-clock caption
changes, transcript retention, on-screen and Android Back, and background/resume
after closing a replay. Existing story/save/media regressions also run.
