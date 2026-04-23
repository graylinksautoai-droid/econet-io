// Simple test to verify LILO imports work
import { LiloPersonalityEngine } from './lilo/personality/liloPersonalityEngine.js';
import { useLiloCore } from './lilo/core/useLiloCore.js';
import { useLiloVoice } from './lilo/voice/useLiloVoice.js';

console.log('LILO imports working!');
console.log('Personality Engine:', LiloPersonalityEngine.analyze('hello'));
console.log('All systems operational!');
