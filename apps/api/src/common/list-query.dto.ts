import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import type { Paginated } from '@sml/shared';

/** Query standar list: pagination, sort, dan search di server (docs/tech-stack.md). */
export class ListQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 25, maximum: 200 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  pageSize: number = 25;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  sort?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional() @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'asc';

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  search?: string;

  get skip() {
    return (this.page - 1) * this.pageSize;
  }
}

export function paginated<T>(data: T[], total: number, q: ListQueryDto): Paginated<T> {
  return { data, total, page: q.page, pageSize: q.pageSize };
}
