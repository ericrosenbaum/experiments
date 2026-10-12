// POST /api/bricktalk on Vercel (see server/bricktalk.js).
import { translate } from '../server/bricktalk.js';
import { vercelHandler, hasKey } from './_handler.js';

export default vercelHandler(translate, { probe: hasKey });
