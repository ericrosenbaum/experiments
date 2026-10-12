// POST /api/generate on Vercel (see server/generate.js).
import { generate } from '../server/generate.js';
import { vercelHandler, hasKey } from './_handler.js';

export default vercelHandler(generate, { probe: hasKey });
