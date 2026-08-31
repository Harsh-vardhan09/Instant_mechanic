import type { Request, Response } from 'express';
import type { RangeQuery } from './analytics.schema.js';
import * as analyticsService from './analytics.service.js';

/** HTTP in, HTTP out. Every figure is already aggregated by the time it reaches here. */

export async function dashboard(_req: Request, res: Response): Promise<void> {
  res.status(200).json({ data: await analyticsService.getDashboard() });
}

export async function bookingsOverTime(req: Request, res: Response): Promise<void> {
  const data = await analyticsService.getBookingsOverTime(req.query as unknown as RangeQuery);
  res.status(200).json({ data });
}

export async function revenueOverTime(req: Request, res: Response): Promise<void> {
  const data = await analyticsService.getRevenueOverTime(req.query as unknown as RangeQuery);
  res.status(200).json({ data });
}

export async function statusBreakdown(_req: Request, res: Response): Promise<void> {
  res.status(200).json({ data: await analyticsService.getStatusBreakdown() });
}

export async function serviceBreakdown(_req: Request, res: Response): Promise<void> {
  res.status(200).json({ data: await analyticsService.getServiceBreakdown() });
}
