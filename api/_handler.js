// Turns one of the server/ functions ({status, body} from an input object)
// into a Vercel function. GET answers the page's "is Claude here?" probe;
// POST runs the function on the JSON body. Files starting with _ aren't routes.
export function vercelHandler(run, { probe } = {}) {
  return async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET' && probe) return res.status(200).json({ available: probe() });
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    try {
      const input = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {};
      const { status, body } = await run(input);
      return res.status(status).json(body);
    } catch (err) {
      return res.status(500).json({ error: String(err?.message ?? err) });
    }
  };
}

export const hasKey = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
