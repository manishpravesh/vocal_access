import { Request, Response } from 'express';

export default async (req: Request, res: Response) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const payload = req.body;
    // Check if the trigger is for the notify step and completed
    const newRow = payload.event?.data?.new;
    if (!newRow) return res.status(400).json({ error: 'Invalid payload' });

    if (newRow.status === 'completed') {
      // In a real implementation, you would query the workflow_step to get config
      // and send to Slack or Email using newRow.output as data.
      console.log(`[NOTIFY] Step run ${newRow.id} completed. Notifying...`, newRow.output);
    }
    
    return res.status(200).json({ message: 'Notification processed' });
  } catch (error: any) {
    console.error('Notify error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
