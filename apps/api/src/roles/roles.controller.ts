import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Menu } from '../common/decorators.js';
import { ListQueryDto } from '../common/list-query.dto.js';
import { RoleDto, UpdateRoleAccessDto } from './roles.dto.js';
import { RolesService } from './roles.service.js';

@ApiTags('roles')
@ApiBearerAuth()
@Controller()
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  /** Daftar ringkas untuk dropdown (cukup login). */
  @Get('roles/options')
  options() {
    return this.roles.options();
  }

  @Menu('roles')
  @Get('roles')
  list(@Query() q: ListQueryDto) {
    return this.roles.list(q);
  }

  @Menu('roles')
  @Post('roles')
  create(@Body() dto: RoleDto) {
    return this.roles.create(dto.name);
  }

  @Menu('roles')
  @Patch('roles/:id')
  rename(@Param('id', ParseIntPipe) id: number, @Body() dto: RoleDto) {
    return this.roles.rename(id, dto.name);
  }

  @Menu('roles')
  @Delete('roles/:id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.roles.remove(id);
  }

  @Menu('role-access')
  @Get('role-access/:roleId')
  getAccess(@Param('roleId', ParseIntPipe) roleId: number) {
    return this.roles.getAccess(roleId);
  }

  @Menu('role-access')
  @Put('role-access/:roleId')
  setAccess(@Param('roleId', ParseIntPipe) roleId: number, @Body() dto: UpdateRoleAccessDto) {
    return this.roles.setAccess(roleId, dto.access);
  }
}
