import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MATRIX_KEYS, SUPER_ROLE, type AccessMap, type Paginated, type RoleAccessResponse, type RoleRow } from '@sml/shared';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ListQueryDto, paginated } from '../common/list-query.dto.js';
import type { MenuAccessDto } from './roles.dto.js';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  options() {
    return this.prisma.role.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } });
  }

  async list(q: ListQueryDto): Promise<Paginated<RoleRow>> {
    const s = q.search?.trim();
    const where: Prisma.RoleWhereInput = s ? { name: { contains: s, mode: 'insensitive' } } : {};
    const [rows, total] = await Promise.all([
      this.prisma.role.findMany({
        where, orderBy: { name: q.order }, skip: q.skip, take: q.pageSize,
        include: { _count: { select: { users: true } } },
      }),
      this.prisma.role.count({ where }),
    ]);
    return paginated(rows.map((r) => ({ id: r.id, name: r.name, userCount: r._count.users })), total, q);
  }

  async create(name: string) {
    try {
      return await this.prisma.role.create({ data: { name: name.trim() } });
    } catch (e) {
      throw this.mapError(e);
    }
  }

  async rename(id: number, name: string) {
    const role = await this.find(id);
    if (role.name === SUPER_ROLE) throw new BadRequestException(`Role ${SUPER_ROLE} tidak bisa diganti namanya.`);
    try {
      return await this.prisma.role.update({ where: { id }, data: { name: name.trim() } });
    } catch (e) {
      throw this.mapError(e);
    }
  }

  async remove(id: number) {
    const role = await this.find(id);
    if (role.name === SUPER_ROLE) throw new BadRequestException(`Role ${SUPER_ROLE} tidak bisa dihapus.`);
    const users = await this.prisma.user.count({ where: { roleId: id } });
    if (users) throw new BadRequestException(`Role masih dipakai ${users} user. Pindahkan user ke role lain dulu.`);
    await this.prisma.role.delete({ where: { id } });
  }

  async getAccess(roleId: number): Promise<RoleAccessResponse> {
    const role = await this.find(roleId);
    const [menus, userCount] = await Promise.all([
      this.prisma.roleMenu.findMany({ where: { roleId } }),
      this.prisma.user.count({ where: { roleId } }),
    ]);
    const access: AccessMap = {};
    menus.forEach((m) => { if (m.isActive) access[m.menuKey] = { view: true, edit: m.allowEdit }; });
    return { role: { id: role.id, name: role.name }, isSuperRole: role.name === SUPER_ROLE, userCount, access };
  }

  /** Ganti seluruh matriks role. Key yang tidak dikenal diabaikan; Edit otomatis memberi Lihat. */
  async setAccess(roleId: number, input: Record<string, MenuAccessDto>) {
    await this.find(roleId);
    const rows = MATRIX_KEYS
      .filter((k) => input[k]?.view || input[k]?.edit)
      .map((k) => ({ roleId, menuKey: k, isActive: true, allowEdit: Boolean(input[k].edit) }));
    // Harus berurutan & atomik: hapus matriks lama lalu tulis yang baru.
    await this.prisma.$transaction(async (tx) => {
      await tx.roleMenu.deleteMany({ where: { roleId } });
      await tx.roleMenu.createMany({ data: rows });
    });
    return this.getAccess(roleId);
  }

  private async find(id: number) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role tidak ditemukan.');
    return role;
  }

  private mapError(e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return new ConflictException('Nama role sudah dipakai.');
    return e;
  }
}
