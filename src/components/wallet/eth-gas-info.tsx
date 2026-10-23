// 'use client';

// import { useTranslations } from 'next-intl';

// interface ETHGasInfoProps {
//   ethBalance: string;
//   estimatedTransfers: number;
//   gasPerTransfer: string;
//   isLoading: boolean;
// }

// export function ETHGasInfo({ ethBalance, estimatedTransfers, gasPerTransfer, isLoading }: ETHGasInfoProps) {
//   const t = useTranslations('wallet.ethGas');
//   const ethBalanceNum = parseFloat(ethBalance);
  
//   return (
//     <div className="bg-card border border-default rounded-lg p-4">
//       <div className="flex items-center justify-between mb-2">
//         <div>
//           <div className="text-xs text-muted mb-1">{t('title')}</div>
//           <div className="text-lg font-bold text-foreground">
//             {isLoading ? "..." : `${ethBalance} ETH`}
//           </div>
//         </div>
//         <div className="text-right">
//           <div className="text-xs text-muted mb-1">{t('approxTransfers')}</div>
//           <div className="text-lg font-bold text-foreground">
//             {isLoading ? "..." : `~${estimatedTransfers} ${t('transfers')}`}
//           </div>
//         </div>
//       </div>
      
//       {!isLoading && estimatedTransfers < 5 && ethBalanceNum > 0 && (
//         <div className="mt-3 p-3 bg-warning-soft border border-warning rounded-lg">
//           <p className="text-xs text-foreground font-medium mb-1">
//             ⚠️ {t('lowEthWarning')}
//           </p>
//           <p className="text-xs text-muted mb-2">
//             {t('lowEthDescription', {
//               gasPerTransfer: parseFloat(gasPerTransfer).toFixed(9),
//               estimatedTransfers
//             })}
//           </p>
//           <a
//             href="https://sepoliafaucet.com/"
//             target="_blank"
//             rel="noopener noreferrer"
//             className="text-xs text-primary hover:underline"
//           >
//             {t('getFaucet')}
//           </a>
//         </div>
//       )}
      
//       {!isLoading && ethBalanceNum === 0 && (
//         <div className="mt-3 p-3 bg-danger border border-danger-border rounded-lg">
//           <p className="text-xs text-foreground font-medium mb-1">
//             ❌ {t('noEthWarning')}
//           </p>
//           <p className="text-xs text-muted mb-2">
//             {t('noEthDescription')}
//           </p>
//           <a
//             href="https://sepoliafaucet.com/"
//             target="_blank"
//             rel="noopener noreferrer"
//             className="text-xs text-primary hover:underline"
//           >
//             {t('getFaucet')}
//           </a>
//         </div>
//       )}
      
//       {!isLoading && estimatedTransfers >= 5 && (
//         <div className="mt-2 text-xs text-muted">
//           💡 {t('sufficientEthInfo', { estimatedTransfers })}
//         </div>
//       )}
//     </div>
//   );
// }

