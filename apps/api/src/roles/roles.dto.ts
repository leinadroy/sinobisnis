import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsString, MaxLength, ValidateBy, type ValidationOptions } from 'class-validator';

export class RoleDto {
  @ApiProperty() @IsString() @IsNotEmpty({ message: 'Nama role wajib diisi.' }) @MaxLength(50)
  name: string;
}

export interface MenuAccessDto {
  view: boolean;
  edit: boolean;
}

/** Setiap nilai map harus berbentuk { view: boolean, edit: boolean }. */
function IsAccessMap(options?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'isAccessMap',
      validator: {
        validate: (value: unknown) =>
          !!value && typeof value === 'object' && !Array.isArray(value) &&
          Object.values(value as Record<string, unknown>).every(
            (v) => !!v && typeof v === 'object' && typeof (v as MenuAccessDto).view === 'boolean' && typeof (v as MenuAccessDto).edit === 'boolean',
          ),
        defaultMessage: () => 'access harus berupa map key menu → { view: boolean, edit: boolean }.',
      },
    },
    options,
  );
}

export class UpdateRoleAccessDto {
  // Map key menu → hak; sengaja tanpa @Type/@ValidateNested agar key menu tidak dianggap properti asing oleh whitelist.
  @ApiProperty({ description: 'Map key menu → { view, edit }', example: { clients: { view: true, edit: false } } })
  @IsObject()
  @IsAccessMap()
  access: Record<string, MenuAccessDto>;
}
