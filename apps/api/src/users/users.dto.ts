import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MinLength, ValidateIf } from 'class-validator';

export class CreateUserDto {
  @ApiProperty() @IsString() @IsNotEmpty({ message: 'Fullname wajib diisi.' })
  fullname: string;

  @ApiProperty() @IsString() @Matches(/^[a-zA-Z0-9._-]{3,50}$/, { message: 'Username 3–50 karakter: huruf, angka, titik, _ atau -.' })
  username: string;

  @ApiPropertyOptional() @IsOptional() @ValidateIf((o) => o.email !== '') @IsEmail({}, { message: 'Format email tidak valid.' })
  email?: string | null;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt()
  roleId?: number | null;

  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ minLength: 6 }) @IsString() @MinLength(6, { message: 'Password minimal 6 karakter.' })
  password: string;
}

/** Saat update, password opsional (kosong = tidak diganti). */
export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiPropertyOptional() @IsOptional() @ValidateIf((o) => o.password !== '') @IsString() @MinLength(6, { message: 'Password minimal 6 karakter.' })
  declare password?: string;
}
