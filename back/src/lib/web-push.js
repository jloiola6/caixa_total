"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isWebPushEnabled = isWebPushEnabled;
exports.getWebPushPublicKey = getWebPushPublicKey;
exports.sendPushNotificationToStore = sendPushNotificationToStore;
var web_push_1 = require("web-push");
var db_js_1 = require("../db.js");
var config_js_1 = require("../config.js");
var hasVapidCredentials = config_js_1.config.webPushVapidPublicKey.trim() !== "" &&
    config_js_1.config.webPushVapidPrivateKey.trim() !== "";
if (hasVapidCredentials) {
    web_push_1.default.setVapidDetails(config_js_1.config.webPushVapidSubject, config_js_1.config.webPushVapidPublicKey, config_js_1.config.webPushVapidPrivateKey);
}
else {
    console.warn("[push] Web Push desabilitado: WEB_PUSH_VAPID_PUBLIC_KEY/WEB_PUSH_VAPID_PRIVATE_KEY ausentes.");
}
function isWebPushEnabled() {
    return hasVapidCredentials;
}
function getWebPushPublicKey() {
    return hasVapidCredentials ? config_js_1.config.webPushVapidPublicKey : null;
}
function buildPushPayload(payload) {
    var _a, _b, _c, _d;
    return JSON.stringify({
        title: payload.title,
        body: payload.body,
        icon: (_a = payload.icon) !== null && _a !== void 0 ? _a : "/apple-icon.png",
        badge: (_b = payload.badge) !== null && _b !== void 0 ? _b : "/icon-light-32x32.png",
        tag: payload.tag,
        data: __assign(__assign({}, ((_c = payload.data) !== null && _c !== void 0 ? _c : {})), { url: (_d = payload.url) !== null && _d !== void 0 ? _d : "/notificacoes" }),
    });
}
function getErrorStatusCode(error) {
    if (!error || typeof error !== "object")
        return null;
    var maybeStatusCode = error.statusCode;
    return typeof maybeStatusCode === "number" ? maybeStatusCode : null;
}
function sendPushNotificationToStore(params) {
    return __awaiter(this, void 0, void 0, function () {
        var subscriptions, payload, staleIds, stats, _i, subscriptions_1, subscription, error_1, statusCode, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!hasVapidCredentials) {
                        return [2 /*return*/, { sent: 0, failed: 0, removed: 0 }];
                    }
                    return [4 /*yield*/, db_js_1.prisma.pushSubscription.findMany({
                            where: { storeId: params.storeId },
                            select: {
                                id: true,
                                endpoint: true,
                                p256dh: true,
                                auth: true,
                                expirationTime: true,
                                deviceId: true,
                            },
                        })];
                case 1:
                    subscriptions = _a.sent();
                    payload = buildPushPayload(params.payload);
                    staleIds = [];
                    stats = { sent: 0, failed: 0, removed: 0 };
                    _i = 0, subscriptions_1 = subscriptions;
                    _a.label = 2;
                case 2:
                    if (!(_i < subscriptions_1.length)) return [3 /*break*/, 7];
                    subscription = subscriptions_1[_i];
                    if (params.excludeDeviceId && subscription.deviceId === params.excludeDeviceId) {
                        return [3 /*break*/, 6];
                    }
                    _a.label = 3;
                case 3:
                    _a.trys.push([3, 5, , 6]);
                    return [4 /*yield*/, web_push_1.default.sendNotification({
                            endpoint: subscription.endpoint,
                            expirationTime: subscription.expirationTime
                                ? subscription.expirationTime.getTime()
                                : null,
                            keys: {
                                p256dh: subscription.p256dh,
                                auth: subscription.auth,
                            },
                        }, payload, { TTL: 300, urgency: "normal" })];
                case 4:
                    _a.sent();
                    stats.sent += 1;
                    return [3 /*break*/, 6];
                case 5:
                    error_1 = _a.sent();
                    statusCode = getErrorStatusCode(error_1);
                    if (statusCode === 404 || statusCode === 410) {
                        staleIds.push(subscription.id);
                    }
                    else {
                        stats.failed += 1;
                        console.error("[push] Falha ao enviar push:", error_1);
                    }
                    return [3 /*break*/, 6];
                case 6:
                    _i++;
                    return [3 /*break*/, 2];
                case 7:
                    if (!(staleIds.length > 0)) return [3 /*break*/, 9];
                    return [4 /*yield*/, db_js_1.prisma.pushSubscription.deleteMany({
                            where: { id: { in: staleIds } },
                        })];
                case 8:
                    result = _a.sent();
                    stats.removed = result.count;
                    _a.label = 9;
                case 9: return [2 /*return*/, stats];
            }
        });
    });
}
