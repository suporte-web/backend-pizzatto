// create-feed.dto.ts

import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateFeedDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  texto?: string;
}