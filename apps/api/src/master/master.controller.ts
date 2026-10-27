import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import { canEdit, canView, MASTER_ENTITIES } from '@sml/shared';
import { CurrentUser } from '../common/decorators.js';
import { ListQueryDto } from '../common/list-query.dto.js';
import type { AuthUser } from '../auth/auth.types.js';
import { MasterService } from './master.service.js';

const SLUGS = MASTER_ENTITIES.map((e) => e.slug);

/**
 * Endpoint generik master data: /api/master/<slug>. Key menu = slug, jadi hak akses dicek per slug
 * di sini (dekorator @Menu bersifat statis).
 */
@ApiTags('master')
@ApiBearerAuth()
@Controller('master')
export class MasterController {
  constructor(private readonly master: MasterService) {}

  private assert(user: AuthUser, slug: string, mode: 'view' | 'edit') {
    this.master.config(slug);
    const ok = mode === 'view' ? canView(user.access, slug) : canEdit(user.access, slug);
    if (!ok) throw new ForbiddenException('Role Anda tidak memiliki akses ke fitur ini.');
  }

  /** Pilihan dropdown (sponsor, project, bill to, keperluan, bank, pajak) — cukup login. */
  @Get('options')
  options() {
    return this.master.options();
  }

  @ApiParam({ name: 'slug', enum: SLUGS })
  @Get(':slug')
  list(@Param('slug') slug: string, @Query() q: ListQueryDto, @CurrentUser() user: AuthUser) {
    this.assert(user, slug, 'view');
    return this.master.list(slug, q);
  }

  @ApiParam({ name: 'slug', enum: SLUGS })
  @Get(':slug/:id')
  get(@Param('slug') slug: string, @Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    this.assert(user, slug, 'view');
    return this.master.get(slug, id);
  }

  @ApiParam({ name: 'slug', enum: SLUGS })
  @Post(':slug')
  create(@Param('slug') slug: string, @Body() body: Record<string, unknown>, @CurrentUser() user: AuthUser) {
    this.assert(user, slug, 'edit');
    return this.master.create(slug, body);
  }

  @ApiParam({ name: 'slug', enum: SLUGS })
  @Patch(':slug/:id')
  update(@Param('slug') slug: string, @Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>, @CurrentUser() user: AuthUser) {
    this.assert(user, slug, 'edit');
    return this.master.update(slug, id, body);
  }

  @ApiParam({ name: 'slug', enum: SLUGS })
  @Delete(':slug/:id')
  @HttpCode(204)
  remove(@Param('slug') slug: string, @Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    this.assert(user, slug, 'edit');
    return this.master.remove(slug, id);
  }
}
