import type { Request, Response } from 'express';
import * as mechanicsService from './mechanics.service.js';
import type { ListMechanicsQuery, UpdateMechanicStatusInput } from './mechanics.schema.js';

export async function list(req: Request, res: Response): Promise<void> {
  res.status(200).json(await mechanicsService.list(req.query as unknown as ListMechanicsQuery));
}

export async function getById(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  res.status(200).json({ data: await mechanicsService.getById(id) });
}

export async function updateStatus(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const data = await mechanicsService.updateStatus(id, req.body as UpdateMechanicStatusInput);
  res.status(200).json({ data });
}
