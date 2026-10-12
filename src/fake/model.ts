import type { GroupMemberType, GroupRole, GroupSettings } from "../directory.js";
import { type Clock, systemClock } from "./clock.js";
import { FakeApiError, invalidInput, notFound } from "./errors.js";

export interface WorkspaceModelOptions {
  clock?: Clock;
  /** How long a new group refuses member inserts. Defaults to a minute. */
  newGroupDelayMs?: number;
  /** The largest page a list returns, and the default. Google's is 200. */
  pageSize?: number;
}

/** Seeds state as if it was written long ago, past every delay. */
export interface SeedOptions {
  settled?: boolean;
}

/** A Directory API group resource, as the fake sends it. */
export interface FakeGroup {
  kind: "admin#directory#group";
  id: string;
  email: string;
  name?: string;
  description?: string;
  directMembersCount: string;
  adminCreated: boolean;
}

/** A Directory API member resource, as the fake sends it. */
export interface FakeMember {
  kind: "admin#directory#member";
  id: string;
  email: string;
  role: GroupRole;
  type: GroupMemberType;
  status?: "ACTIVE";
}

export interface ListParams {
  pageToken?: string | undefined;
  maxResults?: number | undefined;
}

export interface GroupPage {
  kind: "admin#directory#groups";
  groups?: FakeGroup[];
  nextPageToken?: string;
}

export interface MemberPage {
  kind: "admin#directory#members";
  members?: FakeMember[];
  nextPageToken?: string;
}

interface StoredGroup {
  id: string;
  email: string;
  name?: string;
  description?: string;
  /** When the group starts to accept member inserts. */
  acceptsMembersAt: number;
  settings: GroupSettings;
  members: Map<string, StoredMember>;
}

interface StoredMember {
  id: string;
  email: string;
  role: GroupRole;
  type: GroupMemberType;
}

const ROLES: readonly GroupRole[] = ["MEMBER", "MANAGER", "OWNER"];

/**
 * Every field the settings templates set, so an untouched group reads like a real one. Google
 * documents only `spamModerationLevel` and `messageDisplayFont`; the other values are guesses.
 * `defaultMessageDenyNotificationText` is left out because Google omits it while it's empty.
 */
const DEFAULT_SETTINGS: GroupSettings = {
  allowExternalMembers: "false",
  allowGoogleCommunication: "false",
  allowWebPosting: "true",
  archiveOnly: "false",
  customFooterText: "",
  customRolesEnabledForSettingsToBeMerged: "false",
  default_sender: "DEFAULT_SELF",
  enableCollaborativeInbox: "false",
  favoriteRepliesOnTop: "true",
  includeCustomFooter: "false",
  includeInGlobalAddressList: "true",
  isArchived: "false",
  maxMessageBytes: 26214400,
  membersCanPostAsTheGroup: "false",
  messageDisplayFont: "DEFAULT_FONT",
  messageModerationLevel: "MODERATE_NONE",
  primaryLanguage: "en_US",
  replyTo: "REPLY_TO_IGNORE",
  sendMessageDenyNotification: "false",
  showInGroupDirectory: "false",
  spamModerationLevel: "MODERATE",
  whoCanAdd: "ALL_MANAGERS_CAN_ADD",
  whoCanAddReferences: "NONE",
  whoCanApproveMembers: "ALL_MANAGERS_CAN_APPROVE",
  whoCanApproveMessages: "OWNERS_AND_MANAGERS",
  whoCanAssignTopics: "NONE",
  whoCanAssistContent: "NONE",
  whoCanBanUsers: "OWNERS_AND_MANAGERS",
  whoCanContactOwner: "ANYONE_CAN_CONTACT",
  whoCanDeleteAnyPost: "OWNERS_AND_MANAGERS",
  whoCanDeleteTopics: "OWNERS_AND_MANAGERS",
  whoCanDiscoverGroup: "ALL_IN_DOMAIN_CAN_DISCOVER",
  whoCanEnterFreeFormTags: "NONE",
  whoCanHideAbuse: "NONE",
  whoCanInvite: "ALL_MANAGERS_CAN_INVITE",
  whoCanJoin: "CAN_REQUEST_TO_JOIN",
  whoCanLeaveGroup: "ALL_MEMBERS_CAN_LEAVE",
  whoCanLockTopics: "OWNERS_AND_MANAGERS",
  whoCanMakeTopicsSticky: "NONE",
  whoCanMarkDuplicate: "NONE",
  whoCanMarkFavoriteReplyOnAnyTopic: "NONE",
  whoCanMarkFavoriteReplyOnOwnTopic: "NONE",
  whoCanMarkNoResponseNeeded: "NONE",
  whoCanModerateContent: "OWNERS_AND_MANAGERS",
  whoCanModerateMembers: "OWNERS_AND_MANAGERS",
  whoCanModifyMembers: "OWNERS_AND_MANAGERS",
  whoCanModifyTagsAndCategories: "NONE",
  whoCanMoveTopicsIn: "OWNERS_AND_MANAGERS",
  whoCanMoveTopicsOut: "OWNERS_AND_MANAGERS",
  whoCanPostAnnouncements: "OWNERS_AND_MANAGERS",
  whoCanPostMessage: "ANYONE_CAN_POST",
  whoCanTakeTopics: "NONE",
  whoCanUnassignTopic: "NONE",
  whoCanUnmarkFavoriteReplyOnAnyTopic: "NONE",
  whoCanViewGroup: "ALL_MEMBERS_CAN_VIEW",
  whoCanViewMembership: "ALL_MEMBERS_CAN_VIEW",
};

/**
 * Google Workspace groups, members, and group settings, held in memory. Its methods mirror the
 * Directory and Groups Settings API calls the SDK makes, and they throw {@link FakeApiError} where
 * Google answers with an error.
 */
export class WorkspaceModel {
  private readonly clock: Clock;
  private readonly newGroupDelayMs: number;
  private readonly pageSize: number;
  private readonly groups = new Map<string, StoredGroup>();
  private readonly userIds = new Map<string, string>();
  private nextId = 1;

  constructor(options: WorkspaceModelOptions = {}) {
    this.clock = options.clock ?? systemClock;
    this.newGroupDelayMs = options.newGroupDelayMs ?? 60_000;
    this.pageSize = options.pageSize ?? 200;
  }

  insertGroup(
    body: { email?: string | null; name?: string | null; description?: string | null },
    seed: SeedOptions = {},
  ): FakeGroup {
    if (!body.email) {
      throw invalidInput("email");
    }
    const key = body.email.toLowerCase();
    if (this.groups.has(key)) {
      throw new FakeApiError(409, "duplicate", "Entity already exists.");
    }

    const group: StoredGroup = {
      id: this.newId("group"),
      email: body.email,
      acceptsMembersAt: seed.settled ? 0 : this.clock.now() + this.newGroupDelayMs,
      settings: { ...DEFAULT_SETTINGS },
      members: new Map(),
    };
    if (body.name) {
      group.name = body.name;
    }
    if (body.description) {
      group.description = body.description;
    }
    this.groups.set(key, group);
    return this.toGroup(group);
  }

  getGroup(groupKey: string): FakeGroup {
    return this.toGroup(this.requireGroup(groupKey));
  }

  /** Lists every group. The fake holds one customer, so `customer` only has to be present. */
  listGroups(params: ListParams & { customer?: string | undefined; domain?: string | undefined }): GroupPage {
    if (!params.customer && !params.domain) {
      throw new FakeApiError(400, "badRequest", "Bad Request");
    }
    const all = [...this.groups.values()].sort((a, b) => a.email.localeCompare(b.email));
    const { items, nextPageToken } = this.page(all, params);

    // Google leaves the list out entirely when it's empty.
    const page: GroupPage = { kind: "admin#directory#groups" };
    if (items.length > 0) {
      page.groups = items.map((group) => this.toGroup(group));
    }
    if (nextPageToken) {
      page.nextPageToken = nextPageToken;
    }
    return page;
  }

  insertMember(
    groupKey: string,
    body: { email?: string | null; role?: string | null },
    seed: SeedOptions = {},
  ): FakeMember {
    const group = this.requireGroup(groupKey);
    if (!body.email) {
      throw invalidInput("memberKey");
    }
    const role = this.parseRole(body.role ?? "MEMBER");

    // A group too new to take members answers as if it didn't exist yet
    // (googleapis/google-api-nodejs-client#166).
    if (!seed.settled && this.clock.now() < group.acceptsMembersAt) {
      throw notFound("groupKey");
    }
    const key = body.email.toLowerCase();
    if (group.members.has(key)) {
      throw new FakeApiError(409, "duplicate", "Member already exists.");
    }

    const nested = this.groups.get(key);
    if (nested && this.reaches(nested, group)) {
      // The reason and message GAM matches on (GAM-team/GAM src/gam/gamlib/glgapi.py). The status
      // follows the JSON API's convention for conditionNotMet.
      throw new FakeApiError(412, "conditionNotMet", "Cyclic memberships not allowed");
    }

    const member: StoredMember = nested
      ? { id: nested.id, email: nested.email, role, type: "GROUP" }
      : { id: this.userId(key), email: body.email, role, type: "USER" };
    group.members.set(key, member);
    return this.toMember(member);
  }

  getMember(groupKey: string, memberKey: string): FakeMember {
    return this.toMember(this.requireMember(this.requireGroup(groupKey), memberKey));
  }

  listMembers(groupKey: string, params: ListParams = {}): MemberPage {
    const group = this.requireGroup(groupKey);
    const { items, nextPageToken } = this.page([...group.members.values()], params);

    const page: MemberPage = { kind: "admin#directory#members" };
    if (items.length > 0) {
      page.members = items.map((member) => this.toMember(member));
    }
    if (nextPageToken) {
      page.nextPageToken = nextPageToken;
    }
    return page;
  }

  updateMember(groupKey: string, memberKey: string, body: { role?: string | null }): FakeMember {
    const member = this.requireMember(this.requireGroup(groupKey), memberKey);
    if (body.role) {
      member.role = this.parseRole(body.role);
    }
    return this.toMember(member);
  }

  getSettings(groupUniqueId: string): GroupSettings {
    return this.toSettings(this.requireSettingsGroup(groupUniqueId));
  }

  patchSettings(groupUniqueId: string, patch: GroupSettings): GroupSettings {
    const group = this.requireSettingsGroup(groupUniqueId);
    const fields = { ...patch };
    delete fields.kind;
    delete fields.email;
    group.settings = { ...group.settings, ...fields };
    return this.toSettings(group);
  }

  private requireGroup(groupKey: string): StoredGroup {
    const group = this.findGroup(groupKey);
    if (!group) {
      throw notFound("groupKey");
    }
    return group;
  }

  private requireSettingsGroup(groupUniqueId: string): StoredGroup {
    const group = this.findGroup(groupUniqueId);
    if (!group) {
      throw new FakeApiError(404, "notFound", "Not Found");
    }
    return group;
  }

  private findGroup(key: string): StoredGroup | undefined {
    const byEmail = this.groups.get(key.toLowerCase());
    if (byEmail) {
      return byEmail;
    }
    return [...this.groups.values()].find((group) => group.id === key);
  }

  private requireMember(group: StoredGroup, memberKey: string): StoredMember {
    const member =
      group.members.get(memberKey.toLowerCase()) ??
      [...group.members.values()].find((candidate) => candidate.id === memberKey);
    if (!member) {
      throw notFound("memberKey");
    }
    return member;
  }

  /** Whether `target` is `from` or a group nested anywhere under it. */
  private reaches(from: StoredGroup, target: StoredGroup): boolean {
    const seen = new Set<StoredGroup>();
    const stack = [from];
    while (stack.length > 0) {
      const group = stack.pop()!;
      if (group === target) {
        return true;
      }
      if (seen.has(group)) {
        continue;
      }
      seen.add(group);
      for (const member of group.members.values()) {
        const nested = member.type === "GROUP" ? this.groups.get(member.email.toLowerCase()) : undefined;
        if (nested) {
          stack.push(nested);
        }
      }
    }
    return false;
  }

  private parseRole(role: string): GroupRole {
    if (!ROLES.includes(role as GroupRole)) {
      throw invalidInput("role");
    }
    return role as GroupRole;
  }

  private page<T>(items: T[], params: ListParams): { items: T[]; nextPageToken?: string } {
    const size = Math.min(params.maxResults ?? this.pageSize, this.pageSize);
    if (!Number.isInteger(size) || size < 1) {
      throw invalidInput("maxResults");
    }
    const start = params.pageToken ? decodePageToken(params.pageToken) : 0;
    const end = start + size;
    const result: { items: T[]; nextPageToken?: string } = { items: items.slice(start, end) };
    if (end < items.length) {
      result.nextPageToken = encodePageToken(end);
    }
    return result;
  }

  private newId(prefix: string): string {
    return `fake-${prefix}-${this.nextId++}`;
  }

  /** A person keeps one ID across every group they're in, as they do in Google. */
  private userId(email: string): string {
    let id = this.userIds.get(email);
    if (!id) {
      id = this.newId("user");
      this.userIds.set(email, id);
    }
    return id;
  }

  private toGroup(group: StoredGroup): FakeGroup {
    const result: FakeGroup = {
      kind: "admin#directory#group",
      id: group.id,
      email: group.email,
      directMembersCount: String(group.members.size),
      adminCreated: true,
    };
    if (group.name) {
      result.name = group.name;
    }
    if (group.description) {
      result.description = group.description;
    }
    return result;
  }

  private toMember(member: StoredMember): FakeMember {
    const result: FakeMember = {
      kind: "admin#directory#member",
      id: member.id,
      email: member.email,
      role: member.role,
      type: member.type,
    };
    if (member.type === "USER") {
      result.status = "ACTIVE";
    }
    return result;
  }

  private toSettings(group: StoredGroup): GroupSettings {
    return { kind: "groupsSettings#groups", email: group.email, ...group.settings };
  }
}

function encodePageToken(offset: number): string {
  return Buffer.from(String(offset)).toString("base64url");
}

function decodePageToken(token: string): number {
  const offset = Number(Buffer.from(token, "base64url").toString());
  if (!Number.isInteger(offset) || offset < 0) {
    throw invalidInput("pageToken");
  }
  return offset;
}
