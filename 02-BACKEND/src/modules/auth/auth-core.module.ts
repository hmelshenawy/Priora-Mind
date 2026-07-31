import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './strategy/jwt.strategy';
import { JwtTokenService } from './tokens/jwt-token.service';
import { RefreshCookieService } from './tokens/refresh-cookie.service';

/**
 * Auth core framework (task T012). Provides token primitives, the refresh
 * cookie helper, the Passport JWT strategy, and the JWT guard. US1 composes
 * these with the AuthService/Controller + UserAccount/RefreshToken models.
 */
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: () => ({}),
    }),
  ],
  providers: [JwtStrategy, JwtTokenService, RefreshCookieService],
  exports: [PassportModule, JwtModule, JwtTokenService, RefreshCookieService, JwtStrategy],
})
export class AuthCoreModule {}