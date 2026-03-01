import { createTRPCRouter } from "./create-context";
import hiRoute from "./routes/example/hi/route";
import gymsList from "./routes/gyms/list/route";
import gymsGetById from "./routes/gyms/getById/route";
import gymsGetCheckIns from "./routes/gyms/getCheckIns/route";
import gymsGetPayments from "./routes/gyms/getPayments/route";
import checkInsCreate from "./routes/checkIns/create/route";
import checkInsList from "./routes/checkIns/list/route";
import subscriptionsGetCurrent from "./routes/subscriptions/getCurrent/route";
import subscriptionsCreate from "./routes/subscriptions/create/route";
import usersGet from "./routes/users/get/route";
import usersUpdateWallet from "./routes/users/updateWallet/route";
import paymentsInitiate3ds from "./routes/payments/initiate3ds/route";
import paymentsAuthenticate3ds from "./routes/payments/authenticate3ds/route";
import paymentsPayWith3ds from "./routes/payments/payWith3ds/route";
import adminGetAllUsers from "./routes/admin/getAllUsers/route";
import adminGetAllCheckIns from "./routes/admin/getAllCheckIns/route";
import adminGetAllGyms from "./routes/admin/getAllGyms/route";
import adminCreateGym from "./routes/admin/createGym/route";
import adminDeleteGym from "./routes/admin/deleteGym/route";
import adminGetStats from "./routes/admin/getStats/route";
import { sendOTPProcedure } from "./routes/auth/sendOTP/route";
import { verifyOTPProcedure } from "./routes/auth/verifyOTP/route";
import { registerProcedure } from "./routes/auth/register/route";
import { loginProcedure } from "./routes/auth/login/route";
import { googleLoginProcedure } from "./routes/auth/googleLogin/route";
import gymOwnerLogin from "./routes/gymOwners/login/route";
import gymOwnerGetProfile from "./routes/gymOwners/getProfile/route";
import couponsGetAll from "./routes/coupons/getAll/route";
import couponsCreate from "./routes/coupons/create/route";
import couponsUpdate from "./routes/coupons/update/route";
import couponsDelete from "./routes/coupons/delete/route";
import couponsValidate from "./routes/coupons/validate/route";

const exampleRouter = createTRPCRouter({
  hi: hiRoute,
});

const gymsRouter = createTRPCRouter({
  list: gymsList,
  getById: gymsGetById,
  getCheckIns: gymsGetCheckIns,
  getPayments: gymsGetPayments,
});

const checkInsRouter = createTRPCRouter({
  create: checkInsCreate,
  list: checkInsList,
});

const subscriptionsRouter = createTRPCRouter({
  getCurrent: subscriptionsGetCurrent,
  create: subscriptionsCreate,
});

const usersRouter = createTRPCRouter({
  get: usersGet,
  updateWallet: usersUpdateWallet,
});

const paymentsRouter = createTRPCRouter({
  initiate3ds: paymentsInitiate3ds,
  authenticate3ds: paymentsAuthenticate3ds,
  payWith3ds: paymentsPayWith3ds,
});

const adminRouter = createTRPCRouter({
  getAllUsers: adminGetAllUsers,
  getAllCheckIns: adminGetAllCheckIns,
  getAllGyms: adminGetAllGyms,
  createGym: adminCreateGym,
  deleteGym: adminDeleteGym,
  getStats: adminGetStats,
});

const couponsRouter = createTRPCRouter({
  getAll: couponsGetAll,
  create: couponsCreate,
  update: couponsUpdate,
  delete: couponsDelete,
  validate: couponsValidate,
});

const authRouter = createTRPCRouter({
  sendOTP: sendOTPProcedure,
  verifyOTP: verifyOTPProcedure,
  register: registerProcedure,
  login: loginProcedure,
  googleLogin: googleLoginProcedure,
});

const gymOwnersRouter = createTRPCRouter({
  login: gymOwnerLogin,
  getProfile: gymOwnerGetProfile,
});

export const appRouter = createTRPCRouter({
  example: exampleRouter,
  gyms: gymsRouter,
  checkIns: checkInsRouter,
  subscriptions: subscriptionsRouter,
  users: usersRouter,
  payments: paymentsRouter,
  admin: adminRouter,
  auth: authRouter,
  gymOwners: gymOwnersRouter,
  coupons: couponsRouter,
});

export type AppRouter = typeof appRouter;
