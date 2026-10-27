import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class LoginDto {
  @ApiProperty() @IsString() @IsNotEmpty()
  username: string;

  @ApiProperty() @IsString() @IsNotEmpty()
  password: string;
}

export class ChangePasswordDto {
  @ApiProperty() @IsString() @IsNotEmpty()
  current: string;

  @ApiProperty({ minLength: 6 }) @IsString() @MinLength(6, { message: 'Password baru minimal 6 karakter.' })
  password: string;
}

export class UpdateProfileDto {
  @ApiProperty() @IsString() @IsNotEmpty()
  fullname: string;

  @ApiPropertyOptional() @IsOptional() @ValidateIf((o) => o.email !== '') @IsEmail({}, { message: 'Format email tidak valid.' })
  email?: string | null;
}
