import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Menu } from '../common/decorators.js';
import { ListQueryDto } from '../common/list-query.dto.js';
import { KontrakDto } from './kontrak.dto.js';
import { KontrakService } from './kontrak.service.js';

@ApiTags('kontrak')
@ApiBearerAuth()
@Menu('kontrak')
@Controller('kontrak')
export class KontrakController {
  constructor(private readonly kontrak: KontrakService) {}

  @Get()
  list(@Query() q: ListQueryDto) {
    return this.kontrak.list(q);
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.kontrak.get(id);
  }

  @Post()
  create(@Body() dto: KontrakDto) {
    return this.kontrak.create(dto);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: KontrakDto) {
    return this.kontrak.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.kontrak.remove(id);
  }
}
