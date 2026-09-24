import { IsOptional, IsString } from 'class-validator';

export class UpdateFeedDto {
  @IsOptional()
  @IsString()
  texto?: string;

  @IsOptional()
  midiasRemovidas?: string | string[];
}
