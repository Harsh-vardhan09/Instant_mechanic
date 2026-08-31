import type { Request, Response } from 'express';
import * as bookingsService from './bookings.service.js';
import type {
  AssignMechanicInput,
  ChangeStatusInput,
  CreateBookingInput,
  ListBookingsQuery,
} from './bookings.schema.js';

/** HTTP in, HTTP out. No Prisma, no business rules. */

/** The JWT subject, recorded as the actor on every audit row. */
const actorOf = (req: Request): string | null => req.user?.sub ?? null;

export async function list(req: Request, res: Response): Promise<void> {
  const result = await bookingsService.list(req.query as unknown as ListBookingsQuery);
  res.status(200).json(result);
}

export async function getById(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  res.status(200).json({ data: await bookingsService.getById(id) });
}

export async function create(req: Request, res: Response): Promise<void> {
  const booking = await bookingsService.create(req.body as CreateBookingInput, actorOf(req));
  res.status(201).json({ data: booking });
}

export async function changeStatus(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const booking = await bookingsService.changeStatus(
    id,
    req.body as ChangeStatusInput,
    actorOf(req),
  );
  res.status(200).json({ data: booking });
}

export async function assign(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const result = await bookingsService.assignMechanic(
    id,
    req.body as AssignMechanicInput,
    actorOf(req),
  );
  // 200 either way: a repeated assign is a success, not an error — the requested state holds.
  // `idempotent` tells the caller nothing new was written.
  res.status(200).json({ data: result.booking, idempotent: result.idempotent });
}
