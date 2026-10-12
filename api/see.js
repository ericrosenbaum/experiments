// POST /api/see on Vercel (see server/see.js). Pictures are ~50-150 KB of
// base64, well under Vercel's request size limit.
import { see } from '../server/see.js';
import { vercelHandler } from './_handler.js';

export default vercelHandler(see);
