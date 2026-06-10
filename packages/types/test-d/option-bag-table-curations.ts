/// <reference path="../index.d.ts" />

// iap.buy's `options` and push.schedule's `notification_settings` are prose-only
// option bags the field parser cannot read; each is hand-curated as a param-side
// object curation, so every field is optional. A value shaped like the curated
// bag is accepted, and a concrete field reads as `T | undefined` without a cast.

type BuyOptions = Parameters<typeof iap.buy>[1];
type NotificationSettings = Parameters<typeof push.schedule>[4];

const buyOptions: BuyOptions = {
  request_id: "req-1",
  token: "offer-1",
};
iap.buy("com.example.coins", buyOptions);

const _buyRequestId: string | undefined = buyOptions.request_id;
void _buyRequestId;

// @ts-expect-error request_id is string | undefined, not number
const _badBuyRequestId: number = buyOptions.request_id;
void _badBuyRequestId;

const notificationSettings: NotificationSettings = {
  action: "Check it out",
  badge_count: 1,
  priority: 2,
};
push.schedule(60, "Title", "Alert", "{}", notificationSettings);

const _settingsBadgeCount: number | undefined = notificationSettings.badge_count;
void _settingsBadgeCount;

// @ts-expect-error badge_count is number | undefined, not string
const _badSettingsBadgeCount: string = notificationSettings.badge_count;
void _badSettingsBadgeCount;
