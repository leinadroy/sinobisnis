import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import {
  MATRIX_ITEMS, MENU_KEY_BY_ITEM_ID, NEW_MENU_ITEMS, SUPER_ROLE,
  type AccessMap, type Paginated, type RoleAccessResponse, type RoleRow,
} from '@sml/shared';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ListQueryDto, paginated } from '../common/list-query.dto.js';
import type { MenuAccessDto } from './roles.dto.js';

@Injectable()
export class RolesService implements OnModuleInit {
  private readonly logger = new Logger('Roles');

  constructor(private readonly prisma: PrismaService) {}

  /** Menu baru (belum ada di aplikasi lama) butuh baris menuitem supaya hak aksesnya bisa disimpan di rolepgmname. */
  async onModuleInit() {
    const existing = new Set((await this.prisma.menuItem.findMany({ select: { id: true } })).map((m) => m.id));
    const missing = NEW_MENU_ITEMS.filter(([id]) => !existing.has(id));
    for (const [id, caption, fatherId, link] of missing) {
      await this.prisma.menuItem.create({
        data: {
          id, caption, order: id, fatherId, type: 1, link, linkParameters: '', linkTarget: '_', iconClass: 'menu-icon fa fa-asterisk',
          showDeveloperOptions: false, showEditOptions: false,
        },
      });
    }
    if (missing.length) this.logger.log(`Menu baru ditambahkan ke menuitem: ${missing.map(([, c]) => c).join(', ')}`);
  }

  options() {
    return this.prisma.role.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } });
  }

  async list(q: ListQueryDto): Promise<Paginated<RoleRow>> {
    const s = q.search?.trim();
    const where: Prisma.RoleWhereInput = s ? { name: { contains: s } } : {};
    const [rows, total] = await Promise.all([
      this.prisma.role.findMany({
        where, orderBy: [{ name: q.order }, { id: 'asc' }], skip: q.skip, take: q.pageSize,
        include: { _count: { select: { users: true } } },
      }),
      this.prisma.role.count({ where }),
    ]);
    return paginated(rows.map((r) => ({ id: r.id, name: r.name, userCount: r._count.users })), total, q);
  }

  /** Tabel role lama tidak punya index unik nama, jadi dicek di sini. */
  private async ensureUniqueName(name: string, exceptId?: number) {
    if (await this.prisma.role.count({ where: { name, ...(exceptId ? { id: { not: exceptId } } : {}) } })) {
      throw new ConflictException('Nama role sudah dipakai.');
    }
  }

  async create(name: string) {
    await this.ensureUniqueName(name.trim());
    return this.prisma.role.create({ data: { name: name.trim() } });
  }

  async rename(id: number, name: string) {
    const role = await this.find(id);
    if (role.name === SUPER_ROLE) throw new BadRequestException(`Role ${SUPER_ROLE} tidak bisa diganti namanya.`);
    await this.ensureUniqueName(name.trim(), id);
    return this.prisma.role.update({ where: { id }, data: { name: name.trim() } });
  }

  async remove(id: number) {
    const role = await this.find(id);
    if (role.name === SUPER_ROLE) throw new BadRequestException(`Role ${SUPER_ROLE} tidak bisa dihapus.`);
    const users = await this.prisma.user.count({ where: { roleId: id } });
    if (users) throw new BadRequestException(`Role masih dipakai ${users} user. Pindahkan user ke role lain dulu.`);
    await this.prisma.$transaction([
      this.prisma.rolePgmname.deleteMany({ where: { roleId: id } }),
      this.prisma.role.delete({ where: { id } }),
    ]);
  }

  async getAccess(roleId: number): Promise<RoleAccessResponse> {
    const role = await this.find(roleId);
    const [programs, userCount] = await Promise.all([
      this.prisma.rolePgmname.findMany({ where: { roleId } }),
      this.prisma.user.count({ where: { roleId } }),
    ]);
    const access: AccessMap = {};
    for (const p of programs) {
      const key = MENU_KEY_BY_ITEM_ID[p.menuItemId];
      if (key && p.isActive) access[key] = { view: true, edit: Boolean(access[key]?.edit || p.isAllowEdit) };
    }
    return { role: { id: role.id, name: role.name }, isSuperRole: role.name === SUPER_ROLE, userCount, access };
  }

  /**
   * Ganti hak akses role untuk semua menu di matriks. Baris rolepgmname lama untuk menu itu diganti satu baris per menu;
   * baris untuk menu yang tidak dikenal aplikasi baru (mis. Action List) dibiarkan. Edit otomatis memberi Lihat.
   */
  async setAccess(roleId: number, input: Record<string, MenuAccessDto>) {
    await this.find(roleId);
    const itemIds = MATRIX_ITEMS.filter((i) => i.menuItemId).map((i) => i.menuItemId!);
    const rows = MATRIX_ITEMS
      .filter((i) => i.menuItemId && (input[i.key]?.view || input[i.key]?.edit))
      .map((i) => ({ roleId, menuItemId: i.menuItemId!, pgmName: i.key, isActive: true, isAllowEdit: Boolean(input[i.key].edit) }));
    await this.prisma.$transaction(async (tx) => {
      await tx.rolePgmname.deleteMany({ where: { roleId, menuItemId: { in: itemIds } } });
      if (rows.length) await tx.rolePgmname.createMany({ data: rows });
    });
    return this.getAccess(roleId);
  }

  private async find(id: number) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role tidak ditemukan.');
    return role;
  }
}
