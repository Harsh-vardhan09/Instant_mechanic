import type { Request, Response } from 'express';
import * as customersService from './customers.service.js';
import type { ListCustomersQuery } from './customers.schema.js';

export async function list(req: Request, res: Response): Promise<void> {
  res.status(200).json(await customersService.list(req.query as unknown as ListCustomersQuery));
}

export async function getById(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  res.status(200).json({ data: await customersService.getById(id) });
}
