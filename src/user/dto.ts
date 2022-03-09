import { Type } from 'class-transformer';
import {
  IsDate,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  IsObject,
  ValidateNested,
} from 'class-validator';
import {
  GridFilterModel,
  GridSortDirection,
  GridSortItem,
  GridSortModel,
} from '@mui/x-data-grid-pro';
import { isArray } from 'util';

export class PaginateDto {
  @IsInt()
  limit: number;
  @IsInt()
  offset: number;
}

export class IntervalDto {
  @IsDate()
  start: Date;
  @IsDate()
  end: Date;
}

export class GridSortItemDto {
  @IsString()
  field: string;
  @IsIn(['asc', 'desc'])
  @IsString()
  sort: string;
}

export class GridFilterItemDto {
  id?: number | string;
  columnField: string;
  value?: any;
  operatorValue?: string;
}

export class GridFilterModelDto {
  @IsArray()
  items: GridFilterItemDto[];

  @IsIn(['and', 'or'])
  linkOperator?: string;
}

export class ListMostTrendingUsersDto extends IntervalDto {
  @ValidateNested({ each: true })
  @Type(() => GridSortItemDto)
  @IsArray()
  sort: GridSortItemDto[];
  @IsObject()
  @ValidateNested()
  filter: GridFilterModel;
}
