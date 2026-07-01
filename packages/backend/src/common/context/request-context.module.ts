import { Global, Module } from '@nestjs/common';
import { RequestContext } from './request-context.service.js';

/**
 * Global module that provides RequestContext to all modules.
 *
 * RequestContext wraps ClsService with typed accessors for the authenticated
 * user. Since ClsModule is already global, making RequestContext global too
 * ensures any module can inject it without explicit imports.
 */
@Global()
@Module({
  providers: [RequestContext],
  exports: [RequestContext],
})
export class RequestContextModule {}
