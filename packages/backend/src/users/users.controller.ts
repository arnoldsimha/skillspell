import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import type { User } from '@skillspell/shared';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { UsersService } from './users.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UserResponseDto } from './dto/user-response.dto.js';

/**
 * User management controller (admin-only).
 *
 * All endpoints require an authenticated user with the `admin` role
 * (or higher — `owner` satisfies the check via hierarchical roles).
 * Provides CRUD operations at `/api/users`.
 */
@Controller('users')
@Roles('admin')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * List all users.
   */
  @Get()
  async findAll(): Promise<UserResponseDto[]> {
    const users = await this.usersService.findAll();
    return users.map(UserResponseDto.fromUser);
  }

  /**
   * Get a user by ID.
   */
  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponseDto> {
    const user = await this.usersService.findById(id);
    return UserResponseDto.fromUser(user);
  }

  /**
   * Create a new user.
   *
   * If `password` is provided, the user will have local auth.
   * Otherwise the user is SSO-only.
   */
  @Post()
  async create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    const user = await this.usersService.create({
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: dto.role,
      password: dto.password,
    });
    return UserResponseDto.fromUser(user);
  }

  /**
   * Update a user's profile, role, status, or password.
   *
   * Only provided fields are updated. Password change revokes
   * all existing sessions for the user.
   *
   * Owner protection: only an owner can modify admin/owner users.
   * Setting role to 'owner' requires `confirmOwnerTransfer: true`.
   */
  @Put(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: User,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.update(id, {
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: dto.role,
      isActive: dto.isActive,
      password: dto.password,
      confirmOwnerTransfer: dto.confirmOwnerTransfer,
    }, actor);
    return UserResponseDto.fromUser(user);
  }

  /**
   * Deactivate a user (soft-delete).
   * Revokes all refresh tokens and sets isActive = false.
   *
   * Owner protection: only an owner can deactivate admin/owner users.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: User,
  ): Promise<{ message: string }> {
    await this.usersService.deactivate(id, actor);
    return { message: `User ${id} deactivated` };
  }
}
