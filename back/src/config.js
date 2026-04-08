"use strict";
var _a, _b, _c, _d, _e, _f, _g;
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
require("dotenv/config");
var required = function (key) {
    var value = process.env[key];
    if (!value) {
        throw new Error("Vari\u00E1vel de ambiente obrigat\u00F3ria n\u00E3o definida: ".concat(key));
    }
    return value;
};
exports.config = {
    port: Number((_a = process.env.PORT) !== null && _a !== void 0 ? _a : 4000),
    databaseUrl: required("DATABASE_URL"),
    jwtSecret: required("JWT_SECRET"),
    frontUrl: (_b = process.env.FRONT_URL) !== null && _b !== void 0 ? _b : "http://localhost:3000",
    resendApiKey: (_c = process.env.RESEND_API_KEY) !== null && _c !== void 0 ? _c : "",
    resendFrom: (_d = process.env.RESEND_FROM) !== null && _d !== void 0 ? _d : "onboarding@resend.dev",
    webPushVapidSubject: (_e = process.env.WEB_PUSH_VAPID_SUBJECT) !== null && _e !== void 0 ? _e : "mailto:suporte@caixatotal.app",
    webPushVapidPublicKey: (_f = process.env.WEB_PUSH_VAPID_PUBLIC_KEY) !== null && _f !== void 0 ? _f : "",
    webPushVapidPrivateKey: (_g = process.env.WEB_PUSH_VAPID_PRIVATE_KEY) !== null && _g !== void 0 ? _g : "",
    isProduction: process.env.NODE_ENV === "production",
};
