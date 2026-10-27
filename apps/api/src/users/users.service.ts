import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import type { Paginated, UserRow } from '@sml/shared';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ListQueryDto, paginated } from '../common/list-query.dto.js';
import type { CreateUserDto, UpdateUserDto } from './users.dto.js';

const SORTABLE: Record<string, (o: Prisma.SortOrder) => Prisma.UserOrderByWithRelationInput> = {
  fullname: (o) => ({ fullname: o }),
  username: (o) => ({ username: o }),
  email: (o) => ({ email: o }),
  isActive: (o) => ({ isActive: o }),
  lastLogin: (o) => ({ lastLogin: { sort: o, nulls: 'last' } }),
  roleName: (o) => ({ role: { name: o } }),
};

type UserWithRole = Prisma.UserGetPayload<{ include: { role: true } }>;
const toRow = (u: UserWithRole): UserRow => ({
  id: u.id, fullname: u.fullname, username: u.username, email: u.email, isActive: u.isActive,
  lastLogin: u.lastLogin?.toISOString() ?? null, roleId: u.roleId, roleName: u.role?.name ?? null,
});

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListQueryDto): Promise<Paginated<UserRow>> {
    const s = q.search?.trim();
    const where: Prisma.UserWhereInput = s
      ? { OR: [
          { fullname: { contains: s, mode: 'insensitive' } },
          { username: { contains: s, mode: 'insensitive' } },
          { email: { contains: s, mode: 'insensitive' } },
          { role: { name: { contains: s, mode: 'insensitive' } } },
        ] }
      : {};
    const orderBy = (SORTABLE[q.sort ?? ''] ?? SORTABLE.fullname)(q.order);
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({ where, orderBy, skip: q.skip, take: q.pageSize, include: { role: true } }),
      this.prisma.user.count({ where }),
    ]);
    return paginated(rows.map(toRow), total, q);
  }

  async get(id: number): Promise<UserRow> {
    const u = await this.prisma.user.findUnique({ where: { id }, include: { role: true } });
    if (!u) throw new NotFoundException('User tidak ditemukan.');
    return toRow(u);
  }

  async create(dto: CreateUserDto): Promise<UserRow> {
    try {
      const u = await this.prisma.user.create({
        data: {
          fullname: dto.fullname.trim(), username: dto.username.trim(), email: dto.email || null,
          roleId: dto.roleId ?? null, isActive: dto.isActive ?? true, passwordHash: await bcrypt.hash(dto.password, 10),
        },
        include: { role: true },
      });
      return toRow(u);
    } catch (e) {
      throw this.mapError(e);
    }
  }

  async update(id: number, dto: UpdateUserDto, currentUserId: number): Promise<UserRow> {
    if (id === currentUserId && dto.isActive === false) throw new BadRequestException('Tidak bisa menonaktifkan akun sendiri.');
    const data: Prisma.UserUncheckedUpdateInput = {};
    if (dto.fullname !== undefined) data.fullname = dto.fullname.trim();
    if (dto.username !== undefined) data.username = dto.username.trim();
    if (dto.email !== undefined) data.email = dto.email || null;
    if (dto.roleId !== undefined) data.roleId = dto.roleId;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 10);
    try {
      const u = await this.prisma.user.update({ where: { id }, data, include: { role: true } });
      return toRow(u);
    } catch (e) {
      throw this.mapError(e);
    }
  }

  async remove(id: number, currentUserId: number) {
    if (id === currentUserId) throw new BadRequestException('Tidak bisa menghapus akun sendiri.');
    try {
      await this.prisma.user.delete({ where: { id } });
    } catch (e) {
      throw this.mapError(e);
    }
  }

  private mapError(e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') return new ConflictException('Username sudah dipakai.');
      if (e.code === 'P2025') return new NotFoundException('User tidak ditemukan.');
    }
    return e;
  }
}
