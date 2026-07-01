import { Expose, Exclude, Type } from 'class-transformer';
import { MarketplaceListItemDto } from './marketplace-list-item.dto.js';

@Exclude()
export class MarketplaceBrowseResponseDto {
  @Expose()
  @Type(() => MarketplaceListItemDto)
  items!: MarketplaceListItemDto[];

  @Expose() total!: number;
}
