import { PipeTransform, Injectable } from '@nestjs/common';

/**
 * Transforms an optional version string param into a number.
 * Accepts plain numbers like "3" from route params (e.g. `/v:version/:id`).
 * Returns undefined when the param is absent or invalid — falling back
 * to the latest version rather than rejecting the request.
 */
@Injectable()
export class ParseVersionPipe
  implements PipeTransform<string | undefined, number | undefined>
{
  transform(value: string | undefined): number | undefined {
    if (value == null || value === '') return undefined;
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 1) return undefined;
    return num;
  }
}
