import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Paginated, UserRow } from '@sml/shared';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { hashPassword } from '../auth/password.js';
import { dt2s, GX_EMPTY_DATE } from '../common/dates.js';
import { ListQueryDto, paginated } from '../common/list-query.dto.js';
import type { CreateUserDto, UpdateUserDto } from './users.dto.js';

const SORTABLE: Record<string, (o: Prisma.SortOrder) => Prisma.UserOrderByWithRelationInput> = {
  fullname: (o) => ({ fullname: o }),
  username: (o) => ({ username: o }),
  email: (o) => ({ email: o }),
  isActive: (o) => ({ isActive: o }),
  lastLogin: (o) => ({ lastLogin: o }),
  roleName: (o) => ({ role: { name: o } }),
};

type UserWithRole = Prisma.UserGetPayload<{ include: { role: true } }>;
const toRow = (u: UserWithRole): UserRow => ({
  id: u.id, fullname: u.fullname, username: u.username, email: u.email || null, isActive: u.isActive,
  lastLogin: dt2s(u.lastLogin), roleId: u.roleId, roleName: u.role.name,
});

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Database login: sama dengan tempat AuthService membaca user. Di database hanya-baca = profil login (mis. lokal),
   * atau — dengan DB_WRITE_USERS_<PROFIL>=1 — koneksi khusus tabel users di database itu sendiri.
   */
  private get db() {
    return this.prisma.authDb;
  }

  async list(q: ListQueryDto): Promise<Paginated<UserRow>> {
    const s = q.search?.trim();
    // Collation MariaDB (utf8_general_ci) sudah tidak membedakan huruf besar/kecil.
    const where: Prisma.UserWhereInput = s
      ? { OR: [{ fullname: { contains: s } }, { username: { contains: s } }, { email: { contains: s } }, { role: { name: { contains: s } } }] }
      : {};
    const orderBy = (SORTABLE[q.sort ?? ''] ?? SORTABLE.fullname)(q.order);
    const [rows, total] = await Promise.all([
      this.db.user.findMany({ where, orderBy: [orderBy, { id: 'asc' }], skip: q.skip, take: q.pageSize, include: { role: true } }),
      this.db.user.count({ where }),
    ]);
    return paginated(rows.map(toRow), total, q);
  }

  async get(id: number): Promise<UserRow> {
    const u = await this.db.user.findUnique({ where: { id }, include: { role: true } });
    if (!u) throw new NotFoundException('User tidak ditemukan.');
    return toRow(u);
  }

  /** Tabel users lama tidak punya index unik username, jadi dicek di sini. */
  private async ensureUniqueUsername(username: string, exceptId?: number) {
    const dup = await this.db.user.count({ where: { username, ...(exceptId ? { id: { not: exceptId } } : {}) } });
    if (dup) throw new ConflictException('Username sudah dipakai.');
  }

  private async ensureRole(roleId: number | null | undefined) {
    if (!roleId) throw new BadRequestException('Role wajib dipilih.');
    if (!(await this.db.role.count({ where: { id: roleId } }))) throw new BadRequestException('Role tidak ditemukan.');
  }

  async create(dto: CreateUserDto): Promise<UserRow> {
    const username = dto.username.trim();
    await this.ensureUniqueUsername(username);
    await this.ensureRole(dto.roleId);
    const u = await this.db.user.create({
      data: {
        fullname: dto.fullname.trim(), username, email: dto.email?.trim() || '', roleId: dto.roleId!, isActive: dto.isActive ?? true,
        lastLogin: GX_EMPTY_DATE, ...(await hashPassword(dto.password)),
      },
      include: { role: true },
    });
    return toRow(u);
  }

  async update(id: number, dto: UpdateUserDto, currentUserId: number): Promise<UserRow> {
    await this.get(id);
    if (id === currentUserId && dto.isActive === false) throw new BadRequestException('Tidak bisa menonaktifkan akun sendiri.');
    const data: Prisma.UserUncheckedUpdateInput = {};
    if (dto.fullname !== undefined) data.fullname = dto.fullname.trim();
    if (dto.username !== undefined) {
      data.username = dto.username.trim();
      await this.ensureUniqueUsername(data.username, id);
    }
    if (dto.email !== undefined) data.email = dto.email?.trim() || '';
    if (dto.roleId !== undefined) {
      await this.ensureRole(dto.roleId);
      data.roleId = dto.roleId!;
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.password) Object.assign(data, await hashPassword(dto.password));
    const u = await this.db.user.update({ where: { id }, data, include: { role: true } });
    return toRow(u);
  }

  async remove(id: number, currentUserId: number) {
    if (id === currentUserId) throw new BadRequestException('Tidak bisa menghapus akun sendiri.');
    if (this.prisma.activeProfile.usersWritable) {
      throw new BadRequestException(`Di database ${this.prisma.activeProfile.label} user tidak bisa dihapus. Nonaktifkan saja user ini.`);
    }
    await this.get(id);
    try {
      await this.db.$transaction([
        this.db.userCookie.deleteMany({ where: { userId: id } }),
        this.db.user.delete({ where: { id } }),
      ]);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
        throw new ConflictException('User masih punya data terkait (catatan, notifikasi, antrian cetak). Nonaktifkan saja user ini.');
      }
      throw e;
    }
  }
}
